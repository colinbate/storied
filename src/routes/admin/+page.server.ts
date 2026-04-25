import type { PageServerLoad } from './$types';
import { users, threads, posts, categories } from '$lib/server/db/schema';
import { count } from 'drizzle-orm';
import type { Actions } from './$types';
import { publishWorkerMessage } from '$lib/server/worker-queue';

export const load: PageServerLoad = async ({ locals }) => {
	const [userCount] = await locals.db.select({ count: count() }).from(users);
	const [threadCount] = await locals.db.select({ count: count() }).from(threads);
	const [postCount] = await locals.db.select({ count: count() }).from(posts);
	const [categoryCount] = await locals.db.select({ count: count() }).from(categories);

	return {
		stats: {
			users: userCount.count,
			threads: threadCount.count,
			posts: postCount.count,
			categories: categoryCount.count
		}
	};
};

export const actions: Actions = {
	rebuildSearch: async ({ platform, locals }) => {
		if (!locals.permissions.has('search:rebuild')) return { searchRebuildQueued: false };
		await publishWorkerMessage(platform?.env.WORKER_QUEUE, 'search.rebuild', { scope: 'all' });
		return { searchRebuildQueued: true };
	}
};
