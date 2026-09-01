import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq, sql } from 'drizzle-orm';
import { attendeeIdentities, sessionParticipants, users } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/auth';
import { mergeGuestIdentity } from '$lib/server/attendee-management';
import { isValidRsvpEmail, normalizeRsvpEmail } from '$lib/server/rsvp';

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals, 'sessions:edit');
	const [identityRows, participationCounts] = await Promise.all([
		locals.db
			.select({
				attendee: attendeeIdentities,
				user: {
					id: users.id,
					displayName: users.displayName,
					email: users.email
				}
			})
			.from(attendeeIdentities)
			.leftJoin(users, eq(attendeeIdentities.userId, users.id))
			.orderBy(attendeeIdentities.name)
			.all(),
		locals.db
			.select({
				attendeeId: sessionParticipants.attendeeId,
				count: sql<number>`count(*)`
			})
			.from(sessionParticipants)
			.groupBy(sessionParticipants.attendeeId)
			.all()
	]);
	const countByIdentity = new Map(
		participationCounts.map((row) => [row.attendeeId, Number(row.count)])
	);
	const identities = identityRows.map((row) => ({
		...row,
		participationCount: countByIdentity.get(row.attendee.id) ?? 0
	}));

	return {
		identities,
		guests: identities.filter((row) => !row.attendee.userId),
		totalParticipationCount: participationCounts.reduce((sum, row) => sum + Number(row.count), 0)
	};
};

export const actions = {
	update: async ({ request, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const data = await request.formData();
		const attendeeId = data.get('attendeeId')?.toString();
		const name = data.get('name')?.toString().trim() ?? '';
		const email = data.get('email')?.toString().trim() || null;
		if (!attendeeId || !name) return fail(400, { error: 'A guest and name are required.' });
		if (email && !isValidRsvpEmail(email))
			return fail(400, { error: 'Enter a valid email address.' });

		const attendee = await locals.db
			.select()
			.from(attendeeIdentities)
			.where(eq(attendeeIdentities.id, attendeeId))
			.get();
		if (!attendee || attendee.userId)
			return fail(400, { error: 'Only previous guest identities can be edited here.' });

		const emailNormalized = email ? normalizeRsvpEmail(email) : null;
		if (emailNormalized) {
			const existing = await locals.db
				.select({ id: attendeeIdentities.id })
				.from(attendeeIdentities)
				.where(eq(attendeeIdentities.emailNormalized, emailNormalized))
				.get();
			if (existing && existing.id !== attendee.id)
				return fail(409, {
					error:
						'That email belongs to another attendee. Merge this guest into that identity instead.'
				});
		}

		const now = new Date().toISOString();
		await locals.db
			.update(attendeeIdentities)
			.set({ name, email, emailNormalized, updatedAt: now })
			.where(eq(attendeeIdentities.id, attendee.id));
		await locals.db
			.update(sessionParticipants)
			.set({ nameSnapshot: name, emailSnapshot: email, updatedAt: now })
			.where(eq(sessionParticipants.attendeeId, attendee.id));
		return { updated: true };
	},

	merge: async ({ request, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const data = await request.formData();
		const sourceId = data.get('sourceAttendeeId')?.toString();
		const targetId = data.get('targetAttendeeId')?.toString();
		if (!sourceId || !targetId) return fail(400, { error: 'Choose both attendees.' });

		try {
			const result = await mergeGuestIdentity(locals.db, sourceId, targetId);
			return { merged: true, recordsMoved: result.recordsMoved };
		} catch (cause) {
			return fail(400, {
				error:
					cause instanceof Error ? cause.message : 'The attendee identities could not be merged.'
			});
		}
	},

	delete: async ({ request, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const attendeeId = (await request.formData()).get('attendeeId')?.toString();
		if (!attendeeId) return fail(400, { error: 'Missing attendee.' });

		const attendee = await locals.db
			.select()
			.from(attendeeIdentities)
			.where(eq(attendeeIdentities.id, attendeeId))
			.get();
		if (!attendee || attendee.userId)
			return fail(400, { error: 'Only unused previous guest identities can be deleted.' });
		const participation = await locals.db
			.select({ id: sessionParticipants.id })
			.from(sessionParticipants)
			.where(eq(sessionParticipants.attendeeId, attendee.id))
			.get();
		if (participation)
			return fail(409, {
				error:
					'This guest still has session records. Delete those records or merge the guest first.'
			});

		await locals.db.delete(attendeeIdentities).where(eq(attendeeIdentities.id, attendee.id));
		return { deleted: true };
	}
} satisfies Actions;
