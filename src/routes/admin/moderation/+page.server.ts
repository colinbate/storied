import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { threads, posts, users, moderationEvents } from '$lib/server/db/schema';
import { eq, desc, isNotNull, and, gte } from 'drizzle-orm';
import { newId } from '$lib/server/ids';
import { requirePermission } from '$lib/server/auth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _eq: any = eq;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _and: any = and;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _desc: any = desc;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _isNotNull: any = isNotNull;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _gte: any = gte;

const RECENT_POST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals, 'moderate');

	const deletedThreads = await locals.db
		.select({
			thread: threads,
			author: {
				id: users.id,
				displayName: users.displayName
			}
		})
		.from(threads)
		.innerJoin(users, _eq(threads.authorUserId, users.id))
		.where(_isNotNull(threads.deletedAt))
		.orderBy(_desc(threads.deletedAt))
		.all();

	const cutoffIso = new Date(Date.now() - RECENT_POST_WINDOW_MS).toISOString();

	const deletedPosts = await locals.db
		.select({
			post: posts,
			thread: {
				id: threads.id,
				slug: threads.slug,
				title: threads.title
			},
			author: {
				id: users.id,
				displayName: users.displayName
			}
		})
		.from(posts)
		.innerJoin(threads, _eq(posts.threadId, threads.id))
		.innerJoin(users, _eq(posts.authorUserId, users.id))
		.where(_and(_isNotNull(posts.deletedAt), _gte(posts.deletedAt, cutoffIso)))
		.orderBy(_desc(posts.deletedAt))
		.all();

	return { deletedThreads, deletedPosts };
};

export const actions: Actions = {
	restoreThread: async ({ request, locals }) => {
		requirePermission(locals, 'moderate');

		const data = await request.formData();
		const threadId = data.get('threadId')?.toString();
		if (!threadId) return fail(400, { error: 'Missing thread ID' });

		const now = new Date().toISOString();
		await locals.db
			.update(threads)
			.set({ deletedAt: null, updatedAt: now })
			.where(_eq(threads.id, threadId));

		await locals.db.insert(moderationEvents).values({
			id: newId(),
			actorUserId: locals.user!.id,
			targetType: 'thread',
			targetId: threadId,
			action: 'restore'
		});

		return { success: true };
	},

	restorePost: async ({ request, locals }) => {
		requirePermission(locals, 'moderate');

		const data = await request.formData();
		const postId = data.get('postId')?.toString();
		if (!postId) return fail(400, { error: 'Missing post ID' });

		const post = await locals.db.select().from(posts).where(_eq(posts.id, postId)).get();
		if (!post) return fail(404, { error: 'Post not found' });

		const now = new Date().toISOString();
		await locals.db
			.update(posts)
			.set({ deletedAt: null, updatedAt: now })
			.where(_eq(posts.id, postId));

		// Re-increment thread reply count
		const thread = await locals.db
			.select()
			.from(threads)
			.where(_eq(threads.id, post.threadId))
			.get();
		if (thread) {
			await locals.db
				.update(threads)
				.set({ replyCount: thread.replyCount + 1, updatedAt: now })
				.where(_eq(threads.id, thread.id));
		}

		await locals.db.insert(moderationEvents).values({
			id: newId(),
			actorUserId: locals.user!.id,
			targetType: 'post',
			targetId: postId,
			action: 'restore'
		});

		return { success: true };
	}
};
