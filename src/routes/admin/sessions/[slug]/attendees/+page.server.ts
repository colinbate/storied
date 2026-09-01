import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, asc, eq } from 'drizzle-orm';
import {
	attendeeIdentities,
	sessionParticipants,
	sessionParticipantSubjects,
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
	updateParticipantStatus,
	upsertAdminParticipation
} from '$lib/server/rsvp';
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

function mergedStatus(a: SessionAttendanceStatus, b: SessionAttendanceStatus) {
	const rank: Record<SessionAttendanceStatus, number> = {
		attended: 70,
		no_show: 60,
		attending: 50,
		waitlisted: 40,
		maybe: 30,
		declined: 20,
		cancelled: 10
	};
	return rank[a] >= rank[b] ? a : b;
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
		if (memberIdentity.id === guest.id) return { reconciled: true };

		const guestParticipations = await locals.db
			.select()
			.from(sessionParticipants)
			.where(eq(sessionParticipants.attendeeId, guest.id))
			.all();
		for (const guestParticipant of guestParticipations) {
			const memberParticipant = await locals.db
				.select()
				.from(sessionParticipants)
				.where(
					and(
						eq(sessionParticipants.sessionId, guestParticipant.sessionId),
						eq(sessionParticipants.attendeeId, memberIdentity.id)
					)
				)
				.get();
			if (!memberParticipant) {
				await locals.db
					.update(sessionParticipants)
					.set({
						attendeeId: memberIdentity.id,
						nameSnapshot: memberIdentity.name,
						emailSnapshot: memberIdentity.email,
						updatedAt: new Date().toISOString()
					})
					.where(eq(sessionParticipants.id, guestParticipant.id));
				continue;
			}
			const guestSubjects = await locals.db
				.select()
				.from(sessionParticipantSubjects)
				.where(eq(sessionParticipantSubjects.participantId, guestParticipant.id))
				.all();
			for (const subject of guestSubjects)
				await locals.db
					.insert(sessionParticipantSubjects)
					.values({ ...subject, participantId: memberParticipant.id })
					.onConflictDoNothing();
			const takeGuestToken =
				!memberParticipant.confirmationToken && !!guestParticipant.confirmationToken;
			const takeGuestLegacyId =
				memberParticipant.legacyRsvpRegistrationId === null &&
				guestParticipant.legacyRsvpRegistrationId !== null;
			if (takeGuestToken || takeGuestLegacyId) {
				await locals.db
					.update(sessionParticipants)
					.set({
						confirmationToken: takeGuestToken ? null : guestParticipant.confirmationToken,
						legacyRsvpRegistrationId: takeGuestLegacyId
							? null
							: guestParticipant.legacyRsvpRegistrationId
					})
					.where(eq(sessionParticipants.id, guestParticipant.id));
			}
			await locals.db
				.update(sessionParticipants)
				.set({
					attendanceStatus: mergedStatus(
						memberParticipant.attendanceStatus,
						guestParticipant.attendanceStatus
					),
					note: memberParticipant.note ?? guestParticipant.note,
					confirmationToken:
						memberParticipant.confirmationToken ?? guestParticipant.confirmationToken,
					legacyRsvpRegistrationId:
						memberParticipant.legacyRsvpRegistrationId ?? guestParticipant.legacyRsvpRegistrationId,
					updatedAt: new Date().toISOString()
				})
				.where(eq(sessionParticipants.id, memberParticipant.id));
			await locals.db
				.delete(sessionParticipants)
				.where(eq(sessionParticipants.id, guestParticipant.id));
		}
		await locals.db.delete(attendeeIdentities).where(eq(attendeeIdentities.id, guest.id));
		return { reconciled: true };
	}
} satisfies Actions;
