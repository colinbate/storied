import type { PageServerLoad } from './$types';
import { categories, threads, users } from '$lib/server/db/schema';
import { eq, isNull, desc, asc, and, count } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	// Load categories
	const allCategories = await locals.db
		.select({
			id: categories.id,
			name: categories.name,
			slug: categories.slug,
			description: categories.description,
			size: count(threads.id).as('size')
		})
		.from(categories)
		.leftJoin(threads, and(eq(threads.categoryId, categories.id), isNull(threads.deletedAt)))
		.groupBy(categories.id, categories.name, categories.description, categories.slug)
		.orderBy(asc(categories.sortOrder), asc(categories.name))
		.all();

	// Load recent threads (not deleted)
	const recentThreads = await locals.db
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
		.where(isNull(threads.deletedAt))
		.orderBy(desc(threads.lastPostAt), desc(threads.createdAt))
		.limit(20)
		.all();

	return {
		categories: allCategories,
		recentThreads
	};
};
