import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { sessions, threads } from '$lib/server/db/schema';
import { listDiscussionCategories } from '$lib/server/discussions';
import { threadViewer } from '$lib/server/thread-access';
import {
	createThreadActions,
	findThreadRow,
	loadThreadView,
	threadSlugCondition,
	threadSubjectsDependency
} from '$lib/server/thread-view';

export const load: PageServerLoad = async ({ params, locals, depends, platform, url }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const row = await findThreadRow(locals.db, threadSlugCondition(locals, params.slug));
	if (!row) {
		throw error(404, 'Thread not found');
	}

	// A session's main discussion lives on the session page.
	if (row.thread.sessionThreadRole === 'primary' && row.thread.sessionId) {
		const session = await locals.db
			.select({ slug: sessions.slug })
			.from(sessions)
			.where(eq(sessions.id, row.thread.sessionId))
			.get();
		if (session) {
			const focusPostId = url?.searchParams.get('post') ?? null;
			const target = focusPostId
				? `/sessions/${session.slug}?post=${encodeURIComponent(focusPostId)}#post-${encodeURIComponent(focusPostId)}`
				: `/sessions/${session.slug}#discussion`;
			throw redirect(302, target);
		}
	}

	depends(threadSubjectsDependency(row.thread.id));

	const view = await loadThreadView({
		locals,
		platform,
		row,
		userId: locals.user.id,
		requestedPage: Number.parseInt(url?.searchParams.get('page') ?? '', 10),
		focusPostId: url?.searchParams.get('post') ?? null
	});
	const discussionCategories = view.session
		? []
		: await listDiscussionCategories(locals.db, threadViewer(locals));

	return { ...view, discussionCategories };
};

export const actions: Actions = createThreadActions({
	resolveThread: ({ locals, params }) =>
		locals.db.select().from(threads).where(threadSlugCondition(locals, params.slug!)).get(),
	afterDelete: () => '/'
});
