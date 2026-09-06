import { fail, type ActionFailure } from '@sveltejs/kit';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import {
	attendeeIdentities,
	sessionParticipants,
	sessions,
	type SessionAttendanceStatus,
	type SessionParticipantSource,
	type users
} from '$lib/server/db/schema';
import type { ORM } from '$lib/server/db';
import { newId } from '$lib/server/ids';
import { canAcceptSessionRsvps, canDeclineSessionRsvp } from '$shared/session-lifecycle';
export {
	canAcceptSessionRsvps,
	canDeclineSessionRsvp,
	isFutureSession,
	sessionStartDate
} from '$shared/session-lifecycle';
import { PRIMARY_ORIGIN } from '$shared/brand';
import {
	sendWaitlistPromotionEmail,
	sendRegistrationConfirmationEmail,
	sendWaitlistConfirmationEmail
} from '$lib/server/rsvp-email';

type StoriedSession = typeof sessions.$inferSelect;
type StoriedUser = typeof users.$inferSelect;
type AttendeeIdentity = typeof attendeeIdentities.$inferSelect;
type SessionParticipant = typeof sessionParticipants.$inferSelect;
type RsvpResponseStatus = 'registered' | 'waitlisted' | 'declined';

export class RsvpIdentityConflictError extends Error {
	constructor(message = 'This email address is already linked to another member identity.') {
		super(message);
		this.name = 'RsvpIdentityConflictError';
	}
}

export class RsvpCapacityError extends Error {
	constructor() {
		super('This session is at capacity and is not accepting a waitlist.');
		this.name = 'RsvpCapacityError';
	}
}

export function normalizeRsvpEmail(email: string) {
	return email.trim().toLowerCase();
}

export function isValidRsvpEmail(email: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function getSessionRsvpSlug(session: Pick<StoriedSession, 'slug' | 'rsvpSlug'>) {
	return session.rsvpSlug?.trim() || session.slug;
}

export async function getSessionByRsvpSlug(db: ORM, slug: string) {
	return db
		.select()
		.from(sessions)
		.where(or(eq(sessions.rsvpSlug, slug), eq(sessions.slug, slug)))
		.get();
}

export async function getAttendeeById(db: ORM, attendeeId: string) {
	return db.select().from(attendeeIdentities).where(eq(attendeeIdentities.id, attendeeId)).get();
}

export async function getOrCreatePublicAttendee(db: ORM, name: string, email: string) {
	const normalized = normalizeRsvpEmail(email);
	const existing = await db
		.select()
		.from(attendeeIdentities)
		.where(eq(attendeeIdentities.emailNormalized, normalized))
		.get();
	const now = new Date().toISOString();

	if (existing) {
		// Public submissions may match a member's email, but they must not rename that member.
		if (existing.userId) return existing;
		if (existing.name !== name || existing.email !== email) {
			return db
				.update(attendeeIdentities)
				.set({ name, email, updatedAt: now })
				.where(eq(attendeeIdentities.id, existing.id))
				.returning()
				.get();
		}
		return existing;
	}

	return db
		.insert(attendeeIdentities)
		.values({ id: newId(), name, email, emailNormalized: normalized })
		.returning()
		.get();
}

export async function getOrCreateAdminAttendee(
	db: ORM,
	data: { name: string; email?: string | null }
) {
	const email = data.email?.trim() || null;
	if (email) return getOrCreatePublicAttendee(db, data.name, email);

	return db.insert(attendeeIdentities).values({ id: newId(), name: data.name }).returning().get();
}

export async function getOrCreateMemberAttendee(db: ORM, user: StoriedUser) {
	const normalized = normalizeRsvpEmail(user.email);
	const [byUser, byEmail] = await Promise.all([
		db.select().from(attendeeIdentities).where(eq(attendeeIdentities.userId, user.id)).get(),
		db
			.select()
			.from(attendeeIdentities)
			.where(eq(attendeeIdentities.emailNormalized, normalized))
			.get()
	]);

	if (byUser && byEmail && byUser.id !== byEmail.id) {
		throw new RsvpIdentityConflictError();
	}
	if (byEmail?.userId && byEmail.userId !== user.id) {
		throw new RsvpIdentityConflictError();
	}

	const existing = byUser ?? byEmail;
	const values = {
		userId: user.id,
		name: user.displayName,
		email: user.email,
		emailNormalized: normalized,
		updatedAt: new Date().toISOString()
	};

	if (existing) {
		return db
			.update(attendeeIdentities)
			.set(values)
			.where(eq(attendeeIdentities.id, existing.id))
			.returning()
			.get();
	}

	return db
		.insert(attendeeIdentities)
		.values({ id: newId(), ...values })
		.returning()
		.get();
}

export async function getParticipantForAttendee(db: ORM, sessionId: string, attendeeId: string) {
	return db
		.select()
		.from(sessionParticipants)
		.where(
			and(
				eq(sessionParticipants.sessionId, sessionId),
				eq(sessionParticipants.attendeeId, attendeeId)
			)
		)
		.get();
}

export async function attendingCount(db: ORM, sessionId: string) {
	const row = await db
		.select({ count: sql<number>`count(*)` })
		.from(sessionParticipants)
		.where(
			and(
				eq(sessionParticipants.sessionId, sessionId),
				eq(sessionParticipants.attendanceStatus, 'attending')
			)
		)
		.get();
	return row?.count ?? 0;
}

export type RsvpMutationResult = {
	participant: SessionParticipant;
	status: RsvpResponseStatus;
	duplicate: boolean;
	promoted: { participant: SessionParticipant; attendee: AttendeeIdentity } | null;
};

export async function setAttendeeRsvp({
	db,
	session,
	attendee,
	response,
	source,
	confirmationToken,
	note
}: {
	db: ORM;
	session: StoriedSession;
	attendee: AttendeeIdentity;
	response: 'attending' | 'declined';
	source: SessionParticipantSource;
	confirmationToken?: string | null;
	note?: string | null;
}): Promise<RsvpMutationResult> {
	let existing = await getParticipantForAttendee(db, session.id, attendee.id);
	if (existing && !existing.confirmationToken) {
		existing = await db
			.update(sessionParticipants)
			.set({ confirmationToken: crypto.randomUUID() })
			.where(eq(sessionParticipants.id, existing.id))
			.returning()
			.get();
	}
	const activeStatuses: SessionAttendanceStatus[] = ['attending', 'waitlisted'];

	if (response === 'attending' && existing && activeStatuses.includes(existing.attendanceStatus)) {
		return {
			participant: existing,
			status: existing.attendanceStatus === 'waitlisted' ? 'waitlisted' : 'registered',
			duplicate: true,
			promoted: null
		};
	}

	let attendanceStatus: SessionAttendanceStatus = 'declined';
	if (response === 'attending') {
		const count = await attendingCount(db, session.id);
		if (count < session.rsvpCapacity) {
			attendanceStatus = 'attending';
		} else if (session.rsvpWaitlistEnabled) {
			attendanceStatus = 'waitlisted';
		} else {
			throw new RsvpCapacityError();
		}
	}

	const wasAttending = existing?.attendanceStatus === 'attending';
	const now = new Date().toISOString();
	const token = existing?.confirmationToken ?? confirmationToken ?? crypto.randomUUID();
	const values = {
		nameSnapshot: attendee.name,
		emailSnapshot: attendee.email,
		attendanceStatus,
		rsvpSource: source,
		confirmationToken: token,
		note: note === undefined ? (existing?.note ?? null) : note,
		updatedAt: now
	};

	const participant = existing
		? await db
				.update(sessionParticipants)
				.set(values)
				.where(eq(sessionParticipants.id, existing.id))
				.returning()
				.get()
		: await db
				.insert(sessionParticipants)
				.values({ id: newId(), sessionId: session.id, attendeeId: attendee.id, ...values })
				.returning()
				.get();

	const promoted =
		wasAttending && attendanceStatus !== 'attending'
			? await promoteNextWaitlisted(db, session.id)
			: null;

	return {
		participant,
		status:
			attendanceStatus === 'waitlisted'
				? 'waitlisted'
				: attendanceStatus === 'declined'
					? 'declined'
					: 'registered',
		duplicate: false,
		promoted
	};
}

export async function promoteNextWaitlisted(db: ORM, sessionId: string) {
	const next = await db
		.select({ participant: sessionParticipants, attendee: attendeeIdentities })
		.from(sessionParticipants)
		.innerJoin(attendeeIdentities, eq(sessionParticipants.attendeeId, attendeeIdentities.id))
		.where(
			and(
				eq(sessionParticipants.sessionId, sessionId),
				eq(sessionParticipants.attendanceStatus, 'waitlisted')
			)
		)
		.orderBy(asc(sessionParticipants.createdAt))
		.get();
	if (!next) return null;

	const participant = await db
		.update(sessionParticipants)
		.set({ attendanceStatus: 'attending', updatedAt: new Date().toISOString() })
		.where(eq(sessionParticipants.id, next.participant.id))
		.returning()
		.get();

	return { participant, attendee: next.attendee };
}

export async function upsertAdminParticipation({
	db,
	session,
	attendee,
	status,
	note
}: {
	db: ORM;
	session: StoriedSession;
	attendee: AttendeeIdentity;
	status: SessionAttendanceStatus;
	note?: string | null;
}) {
	const existing = await getParticipantForAttendee(db, session.id, attendee.id);
	const values = {
		nameSnapshot: attendee.name,
		emailSnapshot: attendee.email,
		attendanceStatus: status,
		rsvpSource: 'admin' as const,
		note: note ?? null,
		updatedAt: new Date().toISOString()
	};
	return existing
		? db
				.update(sessionParticipants)
				.set(values)
				.where(eq(sessionParticipants.id, existing.id))
				.returning()
				.get()
		: db
				.insert(sessionParticipants)
				.values({ id: newId(), sessionId: session.id, attendeeId: attendee.id, ...values })
				.returning()
				.get();
}

export async function updateParticipantStatus(
	db: ORM,
	participantId: string,
	status: SessionAttendanceStatus,
	note?: string | null
) {
	const existing = await db
		.select({ participant: sessionParticipants, session: sessions })
		.from(sessionParticipants)
		.innerJoin(sessions, eq(sessionParticipants.sessionId, sessions.id))
		.where(eq(sessionParticipants.id, participantId))
		.get();
	if (!existing) return null;

	const participant = await db
		.update(sessionParticipants)
		.set({ attendanceStatus: status, note: note ?? null, updatedAt: new Date().toISOString() })
		.where(eq(sessionParticipants.id, participantId))
		.returning()
		.get();
	const promoted =
		existing.participant.attendanceStatus === 'attending' &&
		status !== 'attending' &&
		canAcceptSessionRsvps(existing.session)
			? await promoteNextWaitlisted(db, existing.session.id)
			: null;
	return { participant, session: existing.session, promoted };
}

export async function getParticipantByConfirmationToken(db: ORM, token: string) {
	return db
		.select({ participant: sessionParticipants, attendee: attendeeIdentities, session: sessions })
		.from(sessionParticipants)
		.innerJoin(attendeeIdentities, eq(sessionParticipants.attendeeId, attendeeIdentities.id))
		.innerJoin(sessions, eq(sessionParticipants.sessionId, sessions.id))
		.where(eq(sessionParticipants.confirmationToken, token))
		.get();
}

export async function cancelParticipantByToken(db: ORM, token: string) {
	const row = await getParticipantByConfirmationToken(db, token);
	if (!row) return null;

	if (row.participant.attendanceStatus === 'cancelled') {
		return { ...row, alreadyCancelled: true, promoted: null };
	}
	if (!['attending', 'waitlisted'].includes(row.participant.attendanceStatus)) {
		return { ...row, cannotCancel: true as const, alreadyCancelled: false, promoted: null };
	}

	const wasAttending = row.participant.attendanceStatus === 'attending';
	const participant = await db
		.update(sessionParticipants)
		.set({ attendanceStatus: 'cancelled', updatedAt: new Date().toISOString() })
		.where(eq(sessionParticipants.id, row.participant.id))
		.returning()
		.get();
	const promoted =
		wasAttending && canAcceptSessionRsvps(row.session)
			? await promoteNextWaitlisted(db, row.session.id)
			: null;

	return { ...row, participant, alreadyCancelled: false, promoted };
}

/** Both member and public submissions share confirmation and promotion delivery. */
export async function submitSessionRsvp(
	args: Parameters<typeof setAttendeeRsvp>[0] & {
		platform: App.Platform | undefined;
		baseUrl: string;
	}
) {
	if (
		!(args.response === 'declined'
			? canDeclineSessionRsvp(args.session)
			: canAcceptSessionRsvps(args.session))
	)
		throw new Error('This session is not accepting RSVPs.');
	const result = await setAttendeeRsvp(args);
	let confirmationEmailFailed = false;
	try {
		if (result.promoted)
			await sendWaitlistPromotionEmail(
				args.platform,
				args.session,
				result.promoted.participant,
				result.promoted.attendee,
				args.baseUrl
			);
		if (!result.duplicate && result.status !== 'declined') {
			const send =
				result.status === 'waitlisted'
					? sendWaitlistConfirmationEmail
					: sendRegistrationConfirmationEmail;
			const delivery = await send(
				args.platform,
				args.session,
				result.participant,
				args.attendee,
				args.baseUrl
			);
			confirmationEmailFailed = !delivery.success;
		}
	} catch (error) {
		console.error('RSVP email delivery failed', error);
		confirmationEmailFailed = true;
	}
	return { ...result, confirmationEmailFailed };
}

export async function setMemberRsvp({
	db,
	platform,
	user,
	session,
	status
}: {
	db: ORM;
	platform: App.Platform | undefined;
	user: StoriedUser;
	session: StoriedSession;
	status: 'registered' | 'declined';
}): Promise<
	| { status: RsvpResponseStatus; confirmationEmailFailed: boolean }
	| ActionFailure<{ error: string }>
> {
	if (!(status === 'declined' ? canDeclineSessionRsvp(session) : canAcceptSessionRsvps(session))) {
		return fail(400, { error: 'This session is not currently accepting RSVPs.' });
	}

	try {
		const attendee = await getOrCreateMemberAttendee(db, user);
		const result = await submitSessionRsvp({
			db,
			platform,
			baseUrl: PRIMARY_ORIGIN,
			session,
			attendee,
			response: status === 'registered' ? 'attending' : 'declined',
			source: 'member'
		});

		return { status: result.status, confirmationEmailFailed: result.confirmationEmailFailed };
	} catch (error) {
		if (error instanceof RsvpIdentityConflictError || error instanceof RsvpCapacityError) {
			return fail(409, { error: error.message });
		}
		throw error;
	}
}

export async function getCurrentUserSessionRsvp(db: ORM, sessionId: string, userId: string) {
	const row = await db
		.select({ participant: sessionParticipants })
		.from(sessionParticipants)
		.innerJoin(attendeeIdentities, eq(sessionParticipants.attendeeId, attendeeIdentities.id))
		.where(
			and(
				eq(sessionParticipants.sessionId, sessionId),
				or(
					eq(attendeeIdentities.userId, userId),
					and(
						isNull(attendeeIdentities.userId),
						eq(
							attendeeIdentities.emailNormalized,
							sql`(SELECT lower(trim(email)) FROM users WHERE id = ${userId})`
						)
					)
				)
			)
		)
		.orderBy(sql`CASE WHEN ${attendeeIdentities.userId} = ${userId} THEN 0 ELSE 1 END`)
		.get();
	return row?.participant ?? null;
}
