import { fail } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';

import type { Actions, PageServerLoad } from './$types';
import { groupMemberships, groups, users } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/auth';
import { newId } from '$lib/server/ids';
import { slugify } from '$lib/server/slugify';

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals, 'groups:edit');

	const [allGroups, activeMembers, membershipRows] = await Promise.all([
		locals.db.select().from(groups).orderBy(asc(groups.name)).all(),
		locals.db
			.select({ id: users.id, displayName: users.displayName, email: users.email })
			.from(users)
			.where(eq(users.status, 'active'))
			.orderBy(asc(users.displayName))
			.all(),
		locals.db.select().from(groupMemberships).all()
	]);

	const memberIdsByGroup = new Map<string, string[]>();
	for (const membership of membershipRows) {
		const memberIds = memberIdsByGroup.get(membership.groupId) ?? [];
		memberIds.push(membership.userId);
		memberIdsByGroup.set(membership.groupId, memberIds);
	}

	return {
		groups: allGroups.map((group) => ({
			...group,
			memberIds: memberIdsByGroup.get(group.id) ?? []
		})),
		members: activeMembers
	};
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		requirePermission(locals, 'groups:edit');
		if (!locals.user) return fail(401, { error: 'Missing current user.' });

		const data = await request.formData();
		const name = data.get('name')?.toString().trim();
		const description = data.get('description')?.toString().trim() || null;
		if (!name || name.length < 2 || name.length > 80) {
			return fail(400, { error: 'Group name must be between 2 and 80 characters.' });
		}
		if (description && description.length > 500) {
			return fail(400, { error: 'Group description must be 500 characters or fewer.' });
		}

		await locals.db.insert(groups).values({
			id: newId(),
			slug: slugify(name),
			name,
			description,
			createdByUserId: locals.user.id
		});

		return { groupCreated: true };
	},

	update: async ({ locals, request }) => {
		requirePermission(locals, 'groups:edit');
		const data = await request.formData();
		const groupId = data.get('groupId')?.toString();
		const name = data.get('name')?.toString().trim();
		const description = data.get('description')?.toString().trim() || null;
		if (!groupId || !name || name.length < 2 || name.length > 80) {
			return fail(400, { error: 'Invalid group details.' });
		}
		if (description && description.length > 500) {
			return fail(400, { error: 'Group description must be 500 characters or fewer.' });
		}

		const now = new Date().toISOString();
		const updated = await locals.db
			.update(groups)
			.set({ name, description, updatedAt: now })
			.where(eq(groups.id, groupId))
			.returning({ id: groups.id });
		if (!updated.length) return fail(404, { error: 'Group not found.' });
		return { groupUpdated: true };
	},

	setMembers: async ({ locals, request }) => {
		requirePermission(locals, 'groups:edit');
		if (!locals.user) return fail(401, { error: 'Missing current user.' });

		const data = await request.formData();
		const groupId = data.get('groupId')?.toString();
		if (!groupId) return fail(400, { error: 'Missing group.' });
		const group = await locals.db
			.select({ id: groups.id })
			.from(groups)
			.where(eq(groups.id, groupId))
			.get();
		if (!group) return fail(404, { error: 'Group not found.' });

		const requestedIds = [...new Set(data.getAll('memberIds').map((value) => value.toString()))];
		const validMembers = requestedIds.length
			? await locals.db
					.select({ id: users.id })
					.from(users)
					.where(and(inArray(users.id, requestedIds), eq(users.status, 'active')))
					.all()
			: [];

		await locals.db.batch([
			locals.db.delete(groupMemberships).where(eq(groupMemberships.groupId, groupId)),
			...validMembers.map((member) =>
				locals.db.insert(groupMemberships).values({
					groupId,
					userId: member.id,
					addedByUserId: locals.user!.id
				})
			)
		]);

		return { membersUpdated: true };
	},

	setArchived: async ({ locals, request }) => {
		requirePermission(locals, 'groups:edit');
		const data = await request.formData();
		const groupId = data.get('groupId')?.toString();
		const archived = data.get('archived')?.toString() === 'true';
		if (!groupId) return fail(400, { error: 'Missing group.' });

		const now = new Date().toISOString();
		const updated = await locals.db
			.update(groups)
			.set({ archivedAt: archived ? now : null, updatedAt: now })
			.where(eq(groups.id, groupId))
			.returning({ id: groups.id });
		if (!updated.length) return fail(404, { error: 'Group not found.' });
		return { groupArchived: archived };
	}
};
