import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { categories, threads, users } from '$lib/server/db/schema';
import { eq, isNull, desc, asc } from 'drizzle-orm';

// pnpm resolves two drizzle-orm copies (D1 vs libsql peer variants) whose private types
// are structurally identical but nominally incompatible. The cast avoids the TS2345 mismatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _eq: any = eq;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _isNull: any = isNull;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _desc: any = desc;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _asc: any = asc;

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	// Load categories
	const allCategories = await locals.db
		.select()
		.from(categories)
		.orderBy(_asc(categories.sortOrder))
		.all();

	// Load recent threads (not deleted)
	const recentThreads = await locals.db
		.select({
			thread: threads,
			author: {
				id: users.id,
				displayName: users.displayName,
				avatarUrl: users.avatarUrl,
			},
		})
		.from(threads)
		.innerJoin(users, _eq(threads.authorUserId, users.id))
		.where(_isNull(threads.deletedAt))
		.orderBy(_desc(threads.lastPostAt), _desc(threads.createdAt))
		.limit(20)
		.all();

	return {
		categories: allCategories,
		recentThreads,
	};
};
