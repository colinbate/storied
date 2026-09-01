import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, eq, or } from 'drizzle-orm';
import {
	attendeeIdentities,
	sessionParticipants,
	sessions,
	type SessionAttendanceStatus,
	users
} from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/auth';
import {
	getOrCreateAdminAttendee,
	getOrCreateMemberAttendee,
	getOrCreatePublicAttendee,
	normalizeRsvpEmail,
	RsvpIdentityConflictError
} from '$lib/server/rsvp';
import { newId } from '$lib/server/ids';

type LegacyRegistrationRow = {
	registration_id: number;
	event_slug: string;
	event_capacity: number;
	event_waitlist_enabled: number;
	person_id: number;
	person_name: string;
	person_email: string;
	person_email_normalized: string;
	person_member_id: string | null;
	name_snapshot: string;
	email_snapshot: string;
	member_id_snapshot: string | null;
	status: string;
	confirmation_token: string;
	admin_note: string | null;
	created_at: string;
	updated_at: string;
};

async function readLegacyRows(db: D1Database) {
	const result = await db
		.prepare(
			`
		SELECT
			r.id AS registration_id,
			e.slug AS event_slug,
			e.capacity AS event_capacity,
			e.waitlist_enabled AS event_waitlist_enabled,
			p.id AS person_id,
			p.name AS person_name,
			p.email AS person_email,
			p.email_normalized AS person_email_normalized,
			p.member_id AS person_member_id,
			r.name_snapshot,
			r.email_snapshot,
			r.member_id_snapshot,
			r.status,
			r.confirmation_token,
			r.admin_note,
			r.created_at,
			r.updated_at
		FROM registrations r
		INNER JOIN events e ON e.id = r.event_id
		INNER JOIN people p ON p.id = r.person_id
		ORDER BY e.starts_at, r.created_at
	`
		)
		.all<LegacyRegistrationRow>();
	return result.results;
}

function mapLegacyStatus(status: string): SessionAttendanceStatus {
	switch (status) {
		case 'registered':
			return 'attending';
		case 'waitlisted':
			return 'waitlisted';
		case 'cancelled':
			return 'cancelled';
		case 'attended':
			return 'attended';
		case 'no_show':
			return 'no_show';
		case 'declined':
			return 'declined';
		default:
			return 'maybe';
	}
}

async function preview(locals: App.Locals, platform: App.Platform | undefined) {
	const legacyDb = platform?.env.RSVP_DB;
	if (!legacyDb)
		return {
			configured: false as const,
			registrations: 0,
			matched: 0,
			unmatchedSlugs: [],
			memberConflicts: []
		};
	const [rows, allSessions, allUsers] = await Promise.all([
		readLegacyRows(legacyDb),
		locals.db.select().from(sessions).all(),
		locals.db.select().from(users).all()
	]);
	const sessionSlugs = new Set(
		allSessions.flatMap((session) => [session.slug, session.rsvpSlug].filter(Boolean))
	);
	const userMap = new Map(allUsers.map((user) => [user.id, user]));
	const unmatchedSlugs = [
		...new Set(rows.filter((row) => !sessionSlugs.has(row.event_slug)).map((row) => row.event_slug))
	];
	const memberConflicts = [
		...new Set(
			rows.flatMap((row) => {
				if (!row.person_member_id) return [];
				const user = userMap.get(row.person_member_id);
				if (!user)
					return [`Legacy person ${row.person_id}: member ${row.person_member_id} does not exist`];
				return normalizeRsvpEmail(user.email) === normalizeRsvpEmail(row.person_email)
					? []
					: [`Legacy person ${row.person_id}: member email does not match ${row.person_email}`];
			})
		)
	];
	return {
		configured: true as const,
		registrations: rows.length,
		matched: rows.filter((row) => sessionSlugs.has(row.event_slug)).length,
		unmatchedSlugs,
		memberConflicts
	};
}

export const load: PageServerLoad = async ({ locals, platform }) => {
	requirePermission(locals, 'sessions:edit');
	return { preview: await preview(locals, platform) };
};

export const actions = {
	import: async ({ locals, platform }) => {
		requirePermission(locals, 'sessions:edit');
		const legacyDb = platform?.env.RSVP_DB;
		if (!legacyDb) return fail(500, { error: 'The legacy RSVP_DB binding is not configured.' });
		const rows = await readLegacyRows(legacyDb);
		const summary = { imported: 0, updated: 0, skipped: 0, errors: [] as string[] };

		for (const row of rows) {
			const session = await locals.db
				.select()
				.from(sessions)
				.where(or(eq(sessions.rsvpSlug, row.event_slug), eq(sessions.slug, row.event_slug)))
				.get();
			if (!session) {
				summary.skipped += 1;
				continue;
			}
			await locals.db
				.update(sessions)
				.set({
					rsvpCapacity: Math.max(1, row.event_capacity),
					rsvpWaitlistEnabled: row.event_waitlist_enabled !== 0
				})
				.where(eq(sessions.id, session.id));

			try {
				let attendee = await locals.db
					.select()
					.from(attendeeIdentities)
					.where(eq(attendeeIdentities.legacyRsvpPersonId, row.person_id))
					.get();
				if (!attendee && row.person_member_id) {
					const user = await locals.db
						.select()
						.from(users)
						.where(eq(users.id, row.person_member_id))
						.get();
					if (user && normalizeRsvpEmail(user.email) === normalizeRsvpEmail(row.person_email))
						attendee = await getOrCreateMemberAttendee(locals.db, user);
				}
				if (!attendee && row.person_email.trim())
					attendee = await getOrCreatePublicAttendee(locals.db, row.person_name, row.person_email);
				if (!attendee)
					attendee = await getOrCreateAdminAttendee(locals.db, { name: row.person_name });
				if (attendee.legacyRsvpPersonId === null)
					attendee = await locals.db
						.update(attendeeIdentities)
						.set({ legacyRsvpPersonId: row.person_id, updatedAt: new Date().toISOString() })
						.where(eq(attendeeIdentities.id, attendee.id))
						.returning()
						.get();

				const byLegacy = await locals.db
					.select()
					.from(sessionParticipants)
					.where(eq(sessionParticipants.legacyRsvpRegistrationId, row.registration_id))
					.get();
				const existing =
					byLegacy ??
					(await locals.db
						.select()
						.from(sessionParticipants)
						.where(
							and(
								eq(sessionParticipants.sessionId, session.id),
								eq(sessionParticipants.attendeeId, attendee.id)
							)
						)
						.get());
				const importedStatus = mapLegacyStatus(row.status);
				const status =
					existing && ['attended', 'no_show'].includes(existing.attendanceStatus)
						? existing.attendanceStatus
						: importedStatus;
				const values = {
					nameSnapshot: row.name_snapshot || attendee.name,
					emailSnapshot: row.email_snapshot || attendee.email,
					attendanceStatus: status,
					rsvpSource: 'legacy_import' as const,
					confirmationToken: existing?.confirmationToken ?? row.confirmation_token,
					legacyRsvpRegistrationId: row.registration_id,
					note: existing?.note ?? row.admin_note,
					createdAt: existing?.createdAt ?? row.created_at,
					updatedAt: row.updated_at
				};
				if (existing) {
					await locals.db
						.update(sessionParticipants)
						.set(values)
						.where(eq(sessionParticipants.id, existing.id));
					summary.updated += 1;
				} else {
					await locals.db
						.insert(sessionParticipants)
						.values({ id: newId(), sessionId: session.id, attendeeId: attendee.id, ...values });
					summary.imported += 1;
				}
			} catch (cause) {
				const message =
					cause instanceof RsvpIdentityConflictError || cause instanceof Error
						? cause.message
						: String(cause);
				summary.errors.push(`Registration ${row.registration_id}: ${message}`);
			}
		}
		return { imported: true, summary, preview: await preview(locals, platform) };
	}
} satisfies Actions;
