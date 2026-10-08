import { and, eq, type SQL } from 'drizzle-orm';
import { createEvents, type EventAttributes } from 'ics';
import type { ORM } from './db';
import {
	attendeeIdentities,
	calendarSubscriptions,
	sessionCalendarEntries,
	sessionParticipants,
	sessions,
	users
} from './db/schema';
import { sessionAccessCondition } from './session-lifecycle';
import { sessionStartDate } from '$shared/session-lifecycle';
import {
	NOTIFICATION_FROM_ADDRESS,
	ORGANIZATION_NAME,
	PRIMARY_ORIGIN,
	PUBLIC_ORIGIN
} from '$shared/brand';
import { calendarRsvpLabel } from '$shared/session-calendar-links';

export const CALENDAR_HEADERS = {
	'Content-Type': 'text/calendar; charset=utf-8',
	'Cache-Control': 'private, no-store',
	'Referrer-Policy': 'no-referrer',
	'X-Robots-Tag': 'noindex, nofollow'
};

export async function hashCalendarToken(token: string) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createCalendarSubscription(
	db: ORM,
	userId: string,
	includeWaitlist: boolean
) {
	const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
	const tokenHash = await hashCalendarToken(token);
	await db
		.insert(calendarSubscriptions)
		.values({ userId, tokenHash, includeWaitlist })
		.onConflictDoUpdate({
			target: calendarSubscriptions.userId,
			set: { tokenHash, includeWaitlist, createdAt: new Date().toISOString() }
		});
	return new URL(`/calendar/${token}/meetings.ics`, PRIMARY_ORIGIN).toString();
}

export async function ownCalendarSubscription(db: ORM, userId: string) {
	// Never expose the stored capability hash to page data.
	return db
		.select({
			includeWaitlist: calendarSubscriptions.includeWaitlist,
			createdAt: calendarSubscriptions.createdAt
		})
		.from(calendarSubscriptions)
		.where(eq(calendarSubscriptions.userId, userId))
		.get();
}

export async function revokeCalendarSubscription(db: ORM, userId: string) {
	await db.delete(calendarSubscriptions).where(eq(calendarSubscriptions.userId, userId));
}

async function registrationCalendarRows(db: ORM, condition: SQL | undefined) {
	return db
		.select({
			entry: sessionCalendarEntries,
			session: sessions,
			participant: sessionParticipants,
			attendee: attendeeIdentities
		})
		.from(sessionCalendarEntries)
		.innerJoin(attendeeIdentities, eq(sessionCalendarEntries.attendeeId, attendeeIdentities.id))
		.leftJoin(
			sessions,
			and(
				eq(sessionCalendarEntries.sessionId, sessions.id),
				sessionAccessCondition({ permissions: new Set() })
			)
		)
		.leftJoin(
			sessionParticipants,
			and(
				eq(sessionParticipants.sessionId, sessionCalendarEntries.sessionId),
				eq(sessionParticipants.attendeeId, sessionCalendarEntries.attendeeId)
			)
		)
		.where(condition)
		.all();
}

type CalendarRow = Awaited<ReturnType<typeof registrationCalendarRows>>[number];

function calendarEvent(row: CalendarRow, includeWaitlist = true): EventAttributes | null {
	const { entry, session, participant, attendee } = row;
	if (
		!includeWaitlist &&
		participant?.attendanceStatus === 'waitlisted' &&
		!entry.removed &&
		session?.status !== 'cancelled'
	)
		return null;
	const visible = session && session.status !== 'draft';
	const available =
		visible && session.startsAt && session.durationMinutes && !entry.removed && participant;
	const cancelled =
		!available ||
		session.status === 'cancelled' ||
		!['attending', 'waitlisted', 'maybe'].includes(participant.attendanceStatus) ||
		(!includeWaitlist && participant.attendanceStatus === 'waitlisted');
	const timing = available ? session : entry;
	const start = sessionStartDate(timing);
	if (!start || !timing.durationMinutes || timing.durationMinutes <= 0) return null;
	const status = cancelled
		? 'CANCELLED'
		: participant!.attendanceStatus === 'attending'
			? 'CONFIRMED'
			: 'TENTATIVE';
	const theme = session?.themeTitle ?? session?.theme;
	const detailsUrl =
		visible && !cancelled
			? new URL(
					!attendee.userId && session.isPublic
						? session.astroPath?.trim() || `/sessions/${session.slug}`
						: `/sessions/${session.slug}`,
					!attendee.userId && session.isPublic ? PUBLIC_ORIGIN : PRIMARY_ORIGIN
				).toString()
			: undefined;
	return {
		uid: `${entry.sessionId}@${new URL(PRIMARY_ORIGIN).hostname}`,
		title: visible && participant && !entry.removed ? session.title : 'Meeting cancelled',
		start: [
			start.getUTCFullYear(),
			start.getUTCMonth() + 1,
			start.getUTCDate(),
			start.getUTCHours(),
			start.getUTCMinutes()
		],
		startInputType: 'utc',
		startOutputType: 'utc',
		duration: { minutes: timing.durationMinutes },
		status,
		sequence: entry.sequence,
		lastModified: new Date(entry.changedAt).getTime(),
		classification: 'PRIVATE',
		transp: status === 'CONFIRMED' ? 'OPAQUE' : 'TRANSPARENT',
		description: cancelled
			? 'This meeting or registration is no longer available.'
			: [
					calendarRsvpLabel(participant!.attendanceStatus),
					theme ? `Theme: ${theme}` : null,
					`View session details: ${detailsUrl}`
				]
					.filter(Boolean)
					.join('\n'),
		location: cancelled ? undefined : (session!.locationName ?? undefined),
		url: detailsUrl,
		organizer: { name: ORGANIZATION_NAME, email: NOTIFICATION_FROM_ADDRESS }
	};
}

function calendarResponse(events: EventAttributes[], filename?: string) {
	const { error, value } = createEvents(events, {
		calName: `${ORGANIZATION_NAME} meetings`,
		method: 'PUBLISH'
	});
	if (error || !value) throw new Error('Failed to generate calendar file.');
	return new Response(value, {
		headers: {
			...CALENDAR_HEADERS,
			...(filename ? { 'Content-Disposition': `attachment; filename="${filename}"` } : {})
		}
	});
}

export async function downloadSessionCalendar(
	locals: App.Locals,
	slug: string,
	token?: string | null
) {
	const notFound = () =>
		new Response('Calendar file unavailable.', { status: 404, headers: CALENDAR_HEADERS });
	const session = await locals.db
		.select()
		.from(sessions)
		.where(and(eq(sessions.slug, slug), sessionAccessCondition({ permissions: new Set() })))
		.get();
	if (!session) return notFound();
	let attendeeId: string | undefined;
	if (token) {
		if (!/^[a-f0-9]{64}$/.test(token)) return notFound();
		const participant = await locals.db
			.select()
			.from(sessionParticipants)
			.where(
				and(
					eq(sessionParticipants.sessionId, session.id),
					eq(sessionParticipants.calendarToken, token)
				)
			)
			.get();
		attendeeId = participant?.attendeeId;
	} else if (locals.user) {
		const member = await locals.db
			.select()
			.from(users)
			.where(and(eq(users.id, locals.user.id), eq(users.status, 'active')))
			.get();
		if (!member) return notFound();
		attendeeId = (
			await locals.db
				.select()
				.from(attendeeIdentities)
				.where(eq(attendeeIdentities.userId, member.id))
				.get()
		)?.id;
	}
	if (!attendeeId) return notFound();
	const [row] = await registrationCalendarRows(
		locals.db,
		and(
			eq(sessionCalendarEntries.sessionId, session.id),
			eq(sessionCalendarEntries.attendeeId, attendeeId)
		)!
	);
	if (!row?.participant) return notFound();
	if (row.attendee.userId) {
		const active = await locals.db
			.select({ id: users.id })
			.from(users)
			.where(and(eq(users.id, row.attendee.userId), eq(users.status, 'active')))
			.get();
		if (!active) return notFound();
	}
	const event = calendarEvent(row);
	return event ? calendarResponse([event], 'meeting.ics') : notFound();
}

export async function subscribedMeetingCalendar(db: ORM, token: string, now = new Date()) {
	const notFound = () =>
		new Response('Calendar subscription unavailable.', { status: 404, headers: CALENDAR_HEADERS });
	if (!/^[a-f0-9]{64}$/.test(token)) return notFound();
	const subscription = await db
		.select({ subscription: calendarSubscriptions })
		.from(calendarSubscriptions)
		.innerJoin(users, and(eq(calendarSubscriptions.userId, users.id), eq(users.status, 'active')))
		.where(eq(calendarSubscriptions.tokenHash, await hashCalendarToken(token)))
		.get();
	if (!subscription) return notFound();
	const rows = await registrationCalendarRows(
		db,
		eq(attendeeIdentities.userId, subscription.subscription.userId)
	);
	const since = now.getTime() - 90 * 24 * 60 * 60_000;
	const events = rows
		.map((row) => calendarEvent(row, subscription.subscription.includeWaitlist))
		.filter((event): event is EventAttributes => !!event)
		.filter((event) => {
			const start = event.start as [number, number, number, number, number];
			return (
				Date.UTC(start[0], start[1] - 1, start[2], start[3], start[4]) >= since ||
				(event.status === 'CANCELLED' && Number(event.lastModified) >= since)
			);
		});
	return calendarResponse(events);
}
