import { and, eq, exists, isNull, ne, or, sql } from 'drizzle-orm';

import type { ORM } from '$lib/server/db';
import { groupMemberships, groups, sessions, threads } from '$lib/server/db/schema';

export type ThreadViewer = {
	userId: string | null;
	canModerate: boolean;
	canManageGroups: boolean;
	canManageSessions: boolean;
};

export function threadViewer(locals: App.Locals): ThreadViewer {
	return {
		userId: locals.user?.id ?? null,
		canModerate: locals.permissions.has('moderate'),
		canManageGroups: locals.permissions.has('groups:edit'),
		canManageSessions: locals.permissions.has('sessions:edit')
	};
}

/** Drizzle predicate for selecting only threads visible to a viewer. */
export function threadAccessCondition(db: ORM, viewer: ThreadViewer) {
	const published = viewer.canManageSessions
		? sql`1 = 1`
		: sql`NOT EXISTS (SELECT 1 FROM ${sessions} WHERE ${sessions.id} = ${threads.sessionId} AND ${sessions.status} = 'draft')`;
	if (viewer.canModerate) return published;
	if (!viewer.userId) {
		return and(published, eq(threads.visibility, 'public'), isNull(threads.audienceGroupId));
	}

	return and(
		published,
		ne(threads.visibility, 'admins'),
		or(
			isNull(threads.audienceGroupId),
			exists(
				db
					.select({ value: sql`1` })
					.from(groupMemberships)
					.where(
						and(
							eq(groupMemberships.groupId, threads.audienceGroupId),
							eq(groupMemberships.userId, viewer.userId)
						)
					)
			)
		)
	);
}

/**
 * Equivalent access predicate for the raw D1 queries used by thread lists.
 * Bind parameters are session-manager flag, moderator flag, then user id.
 */
export function threadAccessSql(alias = 't') {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
		throw new Error('Invalid SQL alias');
	}

	return `(? = 1 OR NOT EXISTS (SELECT 1 FROM sessions access_session WHERE access_session.id = ${alias}.session_id AND access_session.status = 'draft')) AND (
		? = 1
		OR (
			${alias}.visibility <> 'admins'
			AND (
				${alias}.audience_group_id IS NULL
				OR EXISTS (
					SELECT 1
					FROM group_memberships access_membership
					WHERE access_membership.group_id = ${alias}.audience_group_id
						AND access_membership.user_id = ?
				)
			)
		)
	)`;
}

export function threadAccessBindings(viewer: ThreadViewer): [number, number, string] {
	return [viewer.canManageSessions ? 1 : 0, viewer.canModerate ? 1 : 0, viewer.userId ?? ''];
}

export async function listAssignableGroups(db: ORM, viewer: ThreadViewer) {
	const selection = {
		id: groups.id,
		slug: groups.slug,
		name: groups.name,
		description: groups.description
	};

	if (viewer.canManageGroups) {
		return db
			.select(selection)
			.from(groups)
			.where(isNull(groups.archivedAt))
			.orderBy(groups.name)
			.all();
	}

	if (!viewer.userId) return [];
	return db
		.select(selection)
		.from(groups)
		.innerJoin(groupMemberships, eq(groupMemberships.groupId, groups.id))
		.where(and(eq(groupMemberships.userId, viewer.userId), isNull(groups.archivedAt)))
		.orderBy(groups.name)
		.all();
}

/** Validate an audience selected during thread creation. */
export async function canAssignGroup(db: ORM, viewer: ThreadViewer, groupId: string) {
	const group = await db
		.select({ id: groups.id })
		.from(groups)
		.where(and(eq(groups.id, groupId), isNull(groups.archivedAt)))
		.get();
	if (!group) return false;
	if (viewer.canManageGroups) return true;
	if (!viewer.userId) return false;

	const membership = await db
		.select({ groupId: groupMemberships.groupId })
		.from(groupMemberships)
		.where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, viewer.userId)))
		.get();
	return !!membership;
}
