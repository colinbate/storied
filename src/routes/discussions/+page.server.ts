import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listDiscussionCategories, listRecentDiscussionThreads } from '$lib/server/discussions';
import { threadViewer } from '$lib/server/thread-access';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const viewer = threadViewer(locals);
	const [categories, recentThreads] = await Promise.all([
		listDiscussionCategories(locals.db, viewer),
		listRecentDiscussionThreads(locals.db, viewer)
	]);

	return { categories, recentThreads };
};
