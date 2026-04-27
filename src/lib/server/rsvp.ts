import { error, fail, type ActionFailure } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { sessionParticipants, sessions, type users } from '$lib/server/db/schema';
import type { ORM } from '$lib/server/db';
import { PUBLIC_ORIGIN } from '$shared/brand';

type StoriedSession = typeof sessions.$inferSelect;
type StoriedUser = typeof users.$inferSelect;
type RsvpResponseStatus = 'registered' | 'declined';
type SessionRsvpStatus = 'attending' | 'not_attending';

type RsvpEventRow = {
	id: number;
	slug: string;
	capacity: number;
	waitlist_enabled: number;
};

type RsvpPersonRow = {
	id: number;
	name: string;
	email: string;
	email_normalized: string;
	member_id: string | null;
};

export function getSessionRsvpSlug(session: Pick<StoriedSession, 'slug' | 'rsvpSlug'>) {
	return session.rsvpSlug?.trim() || session.slug;
}

export function isFutureSession(session: Pick<StoriedSession, 'startsAt'>, now = new Date()) {
	if (!session.startsAt) return false;
	const startsAt = new Date(session.startsAt);
	return Number.isFinite(startsAt.valueOf()) && startsAt > now;
}

function requireRsvpDb(platform: App.Platform | undefined) {
	const db = platform?.env.RSVP_DB;
	if (!db) {
		error(500, 'RSVP database binding is not configured.');
	}
	return db;
}

function rsvpEventStatus(session: Pick<StoriedSession, 'status'>) {
	if (session.status === 'past') return 'completed';
	if (session.status === 'current') return 'open';
	return 'draft';
}

function canonicalSessionUrl(slug: string) {
	return `${PUBLIC_ORIGIN}/sessions/${encodeURIComponent(slug)}`;
}

export async function upsertRsvpEvent({
	db,
	session
}: {
	db: D1Database;
	session: Pick<
		StoriedSession,
		| 'slug'
		| 'rsvpSlug'
		| 'title'
		| 'locationName'
		| 'startsAt'
		| 'durationMinutes'
		| 'status'
		| 'astroPath'
	>;
}): Promise<{ id: number; slug: string } | null> {
	if (!session.startsAt) return null;

	const slug = getSessionRsvpSlug(session);
	const startsAt = new Date(session.startsAt);
	if (!Number.isFinite(startsAt.valueOf())) return null;

	const endsAt = session.durationMinutes
		? new Date(startsAt.valueOf() + session.durationMinutes * 60_000).toISOString()
		: null;

	return db
		.prepare(
			`
			INSERT INTO events (
				slug,
				title,
				canonical_url,
				location,
				starts_at,
				ends_at,
				timezone,
				capacity,
				waitlist_enabled,
				status
			) VALUES (?, ?, ?, ?, ?, ?, 'Atlantic/Bermuda', 12, 1, ?)
			ON CONFLICT(slug) DO UPDATE SET
				title = excluded.title,
				canonical_url = excluded.canonical_url,
				location = excluded.location,
				starts_at = excluded.starts_at,
				ends_at = excluded.ends_at,
				timezone = excluded.timezone,
				capacity = excluded.capacity,
				waitlist_enabled = excluded.waitlist_enabled,
				status = excluded.status,
				updated_at = strftime('%FT%H:%M:%fZ', 'now')
			RETURNING id, slug
		`
		)
		.bind(
			slug,
			session.title,
			canonicalSessionUrl(session.astroPath ?? ''),
			session.locationName,
			startsAt.toISOString(),
			endsAt,
			rsvpEventStatus(session)
		)
		.first<{ id: number; slug: string }>();
}

async function resolveRsvpEvent(db: D1Database, slug: string) {
	return db
		.prepare(
			`
			SELECT id, slug, capacity, waitlist_enabled
			FROM events
			WHERE slug = ?
		`
		)
		.bind(slug)
		.first<RsvpEventRow>();
}

async function assertNoMemberIdentityConflict(
	db: D1Database,
	memberId: string,
	emailNormalized: string
) {
	const conflict = await db
		.prepare(
			`
			SELECT id, email_normalized
			FROM people
			WHERE member_id = ?
				AND email_normalized <> ?
		`
		)
		.bind(memberId, emailNormalized)
		.first<{ id: number; email_normalized: string }>();

	return !conflict;
}

async function upsertRsvpPerson(db: D1Database, user: StoriedUser) {
	const emailNormalized = user.email.trim().toLowerCase();
	const memberId = user.id;

	if (!(await assertNoMemberIdentityConflict(db, memberId, emailNormalized))) {
		return null;
	}

	const person = await db
		.prepare(
			`
			INSERT INTO people (
				name,
				email,
				email_normalized,
				member_id
			) VALUES (?, ?, ?, ?)
			ON CONFLICT(email_normalized) DO UPDATE SET
				name = excluded.name,
				member_id = CASE
					WHEN people.member_id IS NULL OR people.member_id = excluded.member_id
					THEN excluded.member_id
					ELSE people.member_id
				END,
				updated_at = strftime('%FT%H:%M:%fZ', 'now')
			RETURNING id, name, email, email_normalized, member_id
		`
		)
		.bind(user.displayName, user.email, emailNormalized, memberId)
		.first<RsvpPersonRow>();

	if (person?.member_id && person.member_id !== memberId) return null;
	return person;
}

async function upsertRsvpRegistration({
	db,
	eventId,
	person,
	user,
	status
}: {
	db: D1Database;
	eventId: number;
	person: RsvpPersonRow;
	user: StoriedUser;
	status: RsvpResponseStatus;
}) {
	const token = crypto.randomUUID();
	await db
		.prepare(
			`
			INSERT INTO registrations (
				event_id,
				person_id,
				name_snapshot,
				email_snapshot,
				member_id_snapshot,
				status,
				confirmation_token
			) VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(event_id, person_id) DO UPDATE SET
				name_snapshot = excluded.name_snapshot,
				email_snapshot = excluded.email_snapshot,
				member_id_snapshot = excluded.member_id_snapshot,
				status = excluded.status,
				updated_at = strftime('%FT%H:%M:%fZ', 'now')
		`
		)
		.bind(eventId, person.id, user.displayName, user.email, user.id, status, token)
		.run();
	console.log('UPSERT REGISTRATION', {
		eventId,
		personId: person.id,
		displayName: user.displayName,
		email: user.email,
		userId: user.id,
		status,
		token
	});
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
	status: RsvpResponseStatus;
}): Promise<{ status: RsvpResponseStatus } | ActionFailure<{ error: string }>> {
	if (!isFutureSession(session)) {
		return fail(400, { error: 'RSVPs are only available for future sessions.' });
	}

	const rsvpDb = requireRsvpDb(platform);
	const event = await resolveRsvpEvent(rsvpDb, getSessionRsvpSlug(session));
	if (!event) {
		return fail(404, { error: 'RSVP event was not found for this session.' });
	}

	const person = await upsertRsvpPerson(rsvpDb, user);
	if (!person) {
		return fail(409, { error: 'This member identity conflicts with another RSVP person.' });
	}

	await upsertRsvpRegistration({
		db: rsvpDb,
		eventId: event.id,
		person,
		user,
		status
	});

	const attendanceStatus: SessionRsvpStatus =
		status === 'registered' ? 'attending' : 'not_attending';
	const now = new Date().toISOString();

	await db
		.insert(sessionParticipants)
		.values({
			sessionId: session.id,
			userId: user.id,
			attendanceStatus,
			rsvpSource: 'member'
		})
		.onConflictDoUpdate({
			target: [sessionParticipants.sessionId, sessionParticipants.userId],
			set: {
				attendanceStatus,
				rsvpSource: 'member',
				updatedAt: now
			}
		});

	return { status };
}

export async function getCurrentUserSessionRsvp(db: ORM, sessionId: string, userId: string) {
	return db
		.select()
		.from(sessionParticipants)
		.where(
			and(eq(sessionParticipants.sessionId, sessionId), eq(sessionParticipants.userId, userId))
		)
		.get();
}
