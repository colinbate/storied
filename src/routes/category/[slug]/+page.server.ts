import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { categories, threads, users } from '$lib/server/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const category = await locals.db
		.select()
		.from(categories)
		.where(eq(categories.slug, params.slug))
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
		.innerJoin(users, eq(threads.authorUserId, users.id))
		.where(and(eq(threads.categoryId, category.id), isNull(threads.deletedAt)))
		.orderBy(desc(threads.isPinned), desc(threads.lastPostAt), desc(threads.createdAt))
		.all();

	return { category, threads: categoryThreads };
};
