import { and, asc, eq, ne } from 'drizzle-orm';

import type { ORM } from '$lib/server/db';
import { users } from '$lib/server/db/schema';

/**
 * The person members should turn to with questions: the longest-standing active admin.
 * Pass the current user's id so an admin is not pointed at themselves.
 */
export async function getHostUser(db: ORM, excludeUserId?: string | null) {
	const row = await db
		.select({
			id: users.id,
			displayName: users.displayName,
			avatarUrl: users.avatarUrl
		})
		.from(users)
		.where(
			and(
				eq(users.role, 'admin'),
				eq(users.status, 'active'),
				excludeUserId ? ne(users.id, excludeUserId) : undefined
			)
		)
		.orderBy(asc(users.createdAt))
		.get();
	return row ?? null;
}
