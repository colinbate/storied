import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, asc, eq } from 'drizzle-orm';
import {
	attendeeIdentities,
	sessionParticipants,
	sessions,
	type SessionAttendanceStatus,
	users
} from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/auth';
import {
	getAttendeeById,
	getParticipantForAttendee,
	getOrCreateAdminAttendee,
	getOrCreateMemberAttendee,
	isValidRsvpEmail,
	RsvpIdentityConflictError,
	canAcceptSessionRsvps,
	promoteNextWaitlisted,
	updateParticipantStatus,
	upsertAdminParticipation
} from '$lib/server/rsvp';
import { mergeGuestIdentity } from '$lib/server/attendee-management';
import {
	sendRegistrationConfirmationEmail,
	sendWaitlistConfirmationEmail,
	sendWaitlistPromotionEmail
} from '$lib/server/rsvp-email';
import { PRIMARY_ORIGIN } from '$shared/brand';

const statuses = new Set<SessionAttendanceStatus>([
	'attending',
	'waitlisted',
	'maybe',
	'declined',
	'cancelled',
	'attended',
	'no_show'
]);

function parseStatus(value: FormDataEntryValue | null): SessionAttendanceStatus {
	const status = value?.toString() as SessionAttendanceStatus | undefined;
	return status && statuses.has(status) ? status : 'attended';
}

export const load: PageServerLoad = async ({ params, locals }) => {
	requirePermission(locals, 'sessions:edit');
	const session = await locals.db
		.select()
		.from(sessions)
		.where(eq(sessions.slug, params.slug))
		.get();
	if (!session) throw error(404, 'Session not found');

	const [participants, allUsers, identities] = await Promise.all([
		locals.db
			.select({
				participant: sessionParticipants,
				attendee: attendeeIdentities,
				user: {
					id: users.id,
					displayName: users.displayName,
					email: users.email
				}
			})
			.from(sessionParticipants)
			.innerJoin(attendeeIdentities, eq(sessionParticipants.attendeeId, attendeeIdentities.id))
			.leftJoin(users, eq(attendeeIdentities.userId, users.id))
			.where(eq(sessionParticipants.sessionId, session.id))
			.orderBy(asc(attendeeIdentities.name))
			.all(),
		locals.db
			.select()
			.from(users)
			.where(eq(users.status, 'active'))
			.orderBy(asc(users.displayName))
			.all(),
		locals.db.select().from(attendeeIdentities).orderBy(asc(attendeeIdentities.name)).all()
	]);
	const participantIdentityIds = new Set(participants.map((row) => row.attendee.id));
	const participantUserIds = new Set(
		participants.flatMap((row) => (row.user?.id ? [row.user.id] : []))
	);

	return {
		session,
		participants,
		users: allUsers,
		addableUsers: allUsers.filter((user) => !participantUserIds.has(user.id)),
		availableIdentities: identities.filter((identity) => !participantIdentityIds.has(identity.id)),
		counts: Object.fromEntries(
			[...statuses].map((status) => [
				status,
				participants.filter((row) => row.participant.attendanceStatus === status).length
			])
		)
	};
};

export const actions = {
	add: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const session = await locals.db
			.select()
			.from(sessions)
			.where(eq(sessions.slug, params.slug))
			.get();
		if (!session) return fail(404, { error: 'Session not found.' });
		const data = await request.formData();
		const selection = data.get('identity')?.toString() ?? '';
		const name = (data.get('guestName') ?? data.get('name'))?.toString().trim() ?? '';
		const email = data.get('email')?.toString().trim() || null;
		const note = data.get('note')?.toString().trim() || null;
		let attendee;

		try {
			if (selection.startsWith('user:')) {
				const user = await locals.db
					.select()
					.from(users)
					.where(eq(users.id, selection.slice(5)))
					.get();
				if (!user) return fail(404, { error: 'Member not found.' });
				attendee = await getOrCreateMemberAttendee(locals.db, user);
			} else if (selection.startsWith('attendee:')) {
				attendee = await getAttendeeById(locals.db, selection.slice(9));
				if (!attendee) return fail(404, { error: 'Attendee not found.' });
			} else {
				if (!name) return fail(400, { error: 'Enter a name or select an existing person.' });
				if (email && !isValidRsvpEmail(email))
					return fail(400, { error: 'Enter a valid email address.' });
				attendee = await getOrCreateAdminAttendee(locals.db, { name, email });
			}
		} catch (cause) {
			if (cause instanceof RsvpIdentityConflictError) return fail(409, { error: cause.message });
			throw cause;
		}
		if (await getParticipantForAttendee(locals.db, session.id, attendee.id)) {
			return fail(409, { error: 'This person already has a record for this session.' });
		}

		await upsertAdminParticipation({
			db: locals.db,
			session,
			attendee,
			status: parseStatus(data.get('status')),
			note
		});
		return { added: true };
	},

	update: async ({ request, params, locals, platform }) => {
		requirePermission(locals, 'sessions:edit');
		const data = await request.formData();
		const participantId = data.get('participantId')?.toString();
		if (!participantId) return fail(400, { error: 'Missing participant.' });
		const owned = await locals.db
			.select()
			.from(sessionParticipants)
			.innerJoin(sessions, eq(sessionParticipants.sessionId, sessions.id))
			.where(and(eq(sessionParticipants.id, participantId), eq(sessions.slug, params.slug)))
			.get();
		if (!owned) return fail(404, { error: 'Participant not found.' });
		const result = await updateParticipantStatus(
			locals.db,
			participantId,
			parseStatus(data.get('status')),
			data.get('note')?.toString().trim() || null
		);
		if (result?.promoted?.attendee.email)
			await sendWaitlistPromotionEmail(
				platform,
				result.session,
				result.promoted.participant,
				result.promoted.attendee,
				PRIMARY_ORIGIN
			);
		return { updated: true };
	},

	resend: async ({ request, params, locals, platform }) => {
		requirePermission(locals, 'sessions:edit');
		const participantId = (await request.formData()).get('participantId')?.toString();
		const row = participantId
			? await locals.db
					.select({
						participant: sessionParticipants,
						attendee: attendeeIdentities,
						session: sessions
					})
					.from(sessionParticipants)
					.innerJoin(attendeeIdentities, eq(sessionParticipants.attendeeId, attendeeIdentities.id))
					.innerJoin(sessions, eq(sessionParticipants.sessionId, sessions.id))
					.where(and(eq(sessionParticipants.id, participantId), eq(sessions.slug, params.slug)))
					.get()
			: null;
		if (!row || !row.attendee.email)
			return fail(404, { error: 'An emailable participant was not found.' });
		let participant = row.participant;
		if (!participant.confirmationToken)
			participant = await locals.db
				.update(sessionParticipants)
				.set({ confirmationToken: crypto.randomUUID(), updatedAt: new Date().toISOString() })
				.where(eq(sessionParticipants.id, participant.id))
				.returning()
				.get();
		if (participant.attendanceStatus === 'waitlisted')
			await sendWaitlistConfirmationEmail(
				platform,
				row.session,
				participant,
				row.attendee,
				PRIMARY_ORIGIN
			);
		else if (['attending', 'attended'].includes(participant.attendanceStatus))
			await sendRegistrationConfirmationEmail(
				platform,
				row.session,
				participant,
				row.attendee,
				PRIMARY_ORIGIN
			);
		else return fail(400, { error: 'This status does not have a confirmation email.' });
		return { resent: true };
	},

	delete: async ({ request, params, locals, platform }) => {
		requirePermission(locals, 'sessions:edit');
		const participantId = (await request.formData()).get('participantId')?.toString();
		if (!participantId) return fail(400, { error: 'Missing participant.' });

		const row = await locals.db
			.select({ participant: sessionParticipants, session: sessions })
			.from(sessionParticipants)
			.innerJoin(sessions, eq(sessionParticipants.sessionId, sessions.id))
			.where(and(eq(sessionParticipants.id, participantId), eq(sessions.slug, params.slug)))
			.get();
		if (!row) return fail(404, { error: 'Participant not found.' });

		await locals.db
			.delete(sessionParticipants)
			.where(eq(sessionParticipants.id, row.participant.id));
		const promoted =
			row.participant.attendanceStatus === 'attending' && canAcceptSessionRsvps(row.session)
				? await promoteNextWaitlisted(locals.db, row.session.id)
				: null;
		if (promoted?.attendee.email)
			await sendWaitlistPromotionEmail(
				platform,
				row.session,
				promoted.participant,
				promoted.attendee,
				PRIMARY_ORIGIN
			);
		return { deleted: true };
	},

	reconcile: async ({ request, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const data = await request.formData();
		const guestId = data.get('attendeeId')?.toString();
		const userId = data.get('userId')?.toString();
		if (!guestId || !userId) return fail(400, { error: 'Choose a guest and member.' });
		const [guest, user] = await Promise.all([
			getAttendeeById(locals.db, guestId),
			locals.db.select().from(users).where(eq(users.id, userId)).get()
		]);
		if (!guest || guest.userId) return fail(400, { error: 'Choose an unlinked guest.' });
		if (!user) return fail(404, { error: 'Member not found.' });

		let memberIdentity;
		try {
			memberIdentity = await getOrCreateMemberAttendee(locals.db, user);
		} catch (cause) {
			if (cause instanceof RsvpIdentityConflictError) return fail(409, { error: cause.message });
			throw cause;
		}
		if (memberIdentity.id !== guest.id)
			await mergeGuestIdentity(locals.db, guest.id, memberIdentity.id);
		return { reconciled: true };
	}
} satisfies Actions;
