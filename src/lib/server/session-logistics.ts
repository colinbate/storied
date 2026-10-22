import { and, asc, eq } from 'drizzle-orm';
import type { ORM } from './db';
import { venues, sessions, sessionParticipants, users, attendeeIdentities } from './db/schema';
import { MEETING_FORMATS, type MeetingFormat } from '$shared/session-logistics';

type Session = typeof sessions.$inferSelect;
const optional = (data: FormData, key: string) => data.get(key)?.toString().trim() || null;

export function parseLogistics(data: FormData) {
	const meetingFormat = optional(data, 'meetingFormat');
	if (meetingFormat && !Object.hasOwn(MEETING_FORMATS, meetingFormat))
		throw new Error('Choose a valid meeting format.');
	const joiningUrl = optional(data, 'joiningUrl');
	if (joiningUrl) {
		let url: URL;
		try {
			url = new URL(joiningUrl);
		} catch {
			throw new Error('Enter a valid video call URL.');
		}
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
			throw new Error('Video call links must use HTTP or HTTPS without embedded credentials.');
	}
	const result = {
		locationName: optional(data, 'locationName'),
		meetingFormat: meetingFormat as MeetingFormat | null,
		locationAddress: optional(data, 'locationAddress'),
		joiningUrl,
		accessibilityNotes: optional(data, 'accessibilityNotes')
	};
	for (const [key, limit] of [
		['locationName', 200],
		['locationAddress', 2000],
		['joiningUrl', 4000],
		['accessibilityNotes', 4000]
	] as const)
		if ((result[key]?.length ?? 0) > limit)
			throw new Error(
				`${key === 'locationName' ? 'Venue name' : key === 'locationAddress' ? 'Address' : key === 'joiningUrl' ? 'Video call link' : 'Accessibility notes'} is too long (maximum ${limit} characters).`
			);
	return result;
}

export function listVenues(db: ORM) {
	return db.select().from(venues).orderBy(asc(venues.name)).all();
}

export async function resolveSessionLogistics(db: ORM, data: FormData, current?: Session) {
	const venueId = optional(data, 'venueId');
	// Old clients and unrelated session forms retain the existing logistics.
	if (!data.has('venueId') && current)
		return {
			venueId: current.venueId,
			locationName: optional(data, 'locationName'),
			meetingFormat: current.meetingFormat,
			locationAddress: current.locationAddress,
			joiningUrl: current.joiningUrl,
			accessibilityNotes: current.accessibilityNotes
		};
	if (!venueId) return { venueId: null, ...parseLogistics(data) };
	const venue = await db.select().from(venues).where(eq(venues.id, venueId)).get();
	if (!venue || (venue.archivedAt && current?.venueId !== venueId))
		throw new Error('Choose an available venue.');
	// Also works without JavaScript: selecting a different venue copies its saved details.
	if (current?.venueId !== venueId && optional(data, 'logisticsVenueId') !== venueId)
		return {
			venueId: venue.id,
			locationName: venue.name,
			meetingFormat: venue.meetingFormat,
			locationAddress: venue.address,
			joiningUrl: venue.joiningUrl,
			accessibilityNotes: venue.accessibilityNotes
		};
	return { venueId, ...parseLogistics(data) };
}

/** Explicit allowlist for the anonymous RSVP page, including SvelteKit's serialized load data. */
export function publicRsvpSession(session: Session) {
	return {
		id: session.id,
		slug: session.slug,
		title: session.title,
		startsAt: session.startsAt,
		timezone: session.timezone,
		durationMinutes: session.durationMinutes,
		locationName: session.locationName
	};
}

export async function canViewRsvpLogistics(
	db: ORM,
	session: Session,
	userId?: string | null,
	token?: string | null
) {
	if (userId) {
		const member = await db
			.select({ id: users.id })
			.from(users)
			.where(and(eq(users.id, userId), eq(users.status, 'active')))
			.get();
		if (member) return true;
	}
	if (!token || !/^[a-f0-9]{64}$/.test(token) || ['draft', 'cancelled'].includes(session.status))
		return false;
	const participant = await db
		.select({
			id: sessionParticipants.id,
			userId: attendeeIdentities.userId,
			memberStatus: users.status
		})
		.from(sessionParticipants)
		.innerJoin(attendeeIdentities, eq(attendeeIdentities.id, sessionParticipants.attendeeId))
		.leftJoin(users, eq(users.id, attendeeIdentities.userId))
		.where(
			and(
				eq(sessionParticipants.sessionId, session.id),
				eq(sessionParticipants.calendarToken, token),
				eq(sessionParticipants.attendanceStatus, 'attending')
			)
		)
		.get();
	return Boolean(participant && (!participant.userId || participant.memberStatus === 'active'));
}
