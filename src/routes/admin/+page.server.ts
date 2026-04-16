import type { PageServerLoad } from './$types';
import { users, threads, posts, categories } from '$lib/server/db/schema';
import { count } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _count: any = count;

export const load: PageServerLoad = async ({ locals }) => {
	const [userCount] = await locals.db.select({ count: _count() }).from(users);
	const [threadCount] = await locals.db.select({ count: _count() }).from(threads);
	const [postCount] = await locals.db.select({ count: _count() }).from(posts);
	const [categoryCount] = await locals.db.select({ count: _count() }).from(categories);

	return {
		stats: {
			users: userCount.count,
			threads: threadCount.count,
			posts: postCount.count,
			categories: categoryCount.count
		}
	};
};
