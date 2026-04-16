import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { categories, threads, users } from '$lib/server/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';

// pnpm resolves two drizzle-orm copies (D1 vs libsql peer variants) whose private types
// are structurally identical but nominally incompatible. The cast avoids the TS2345 mismatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _eq: any = eq;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _and: any = and;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _isNull: any = isNull;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _desc: any = desc;

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const category = await locals.db
		.select()
		.from(categories)
		.where(_eq(categories.slug, params.slug))
		.get();

	if (!category) {
		throw error(404, 'Category not found');
	}

	const categoryThreads = await locals.db
		.select({
			thread: threads,
			author: {
				id: users.id,
				displayName: users.displayName,
				avatarUrl: users.avatarUrl
			}
		})
		.from(threads)
		.innerJoin(users, _eq(threads.authorUserId, users.id))
		.where(_and(_eq(threads.categoryId, category.id), _isNull(threads.deletedAt)))
		.orderBy(_desc(threads.isPinned), _desc(threads.lastPostAt), _desc(threads.createdAt))
		.all();

	return { category, threads: categoryThreads };
};
