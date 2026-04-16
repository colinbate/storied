import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	threads,
	posts,
	users,
	subscriptions,
	notificationEvents
} from '$lib/server/db/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { newId } from '$lib/server/ids';
import { renderMarkdown } from '$lib/server/markdown';
import { sendReplyNotificationEmail } from '$lib/server/email';

// pnpm resolves two drizzle-orm copies (D1 vs libsql peer variants) whose private types
// are structurally identical but nominally incompatible. The cast avoids the TS2345 mismatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _eq: any = eq;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _and: any = and;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _isNull: any = isNull;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _asc: any = asc;

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const thread = await locals.db
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
		.where(_and(_eq(threads.slug, params.slug), _isNull(threads.deletedAt)))
		.get();

	if (!thread) {
		throw error(404, 'Thread not found');
	}

	const threadPosts = await locals.db
		.select({
			post: posts,
			author: {
				id: users.id,
				displayName: users.displayName,
				avatarUrl: users.avatarUrl
			}
		})
		.from(posts)
		.innerJoin(users, _eq(posts.authorUserId, users.id))
		.where(_and(_eq(posts.threadId, thread.thread.id), _isNull(posts.deletedAt)))
		.orderBy(_asc(posts.createdAt))
		.all();

	// Check if user is subscribed
	const subscription = await locals.db
		.select()
		.from(subscriptions)
		.where(
			_and(
				_eq(subscriptions.userId, locals.user.id),
				_eq(subscriptions.threadId, thread.thread.id)
			)
		)
		.get();

	return {
		thread: thread.thread,
		author: thread.author,
		posts: threadPosts,
		isSubscribed: !!subscription
	};
};

export const actions: Actions = {
	reply: async ({ request, locals, params, platform, url }) => {
		if (!locals.user) {
			throw redirect(302, '/auth/login');
		}

		const data = await request.formData();
		const bodySource = data.get('body')?.toString()?.trim();
		const parentPostId = data.get('parentPostId')?.toString() || null;

		if (!bodySource || bodySource.length < 1) {
			return fail(400, { error: 'Reply cannot be empty.' });
		}

		// Load thread
		const thread = await locals.db
			.select()
			.from(threads)
			.where(_and(_eq(threads.slug, params.slug), _isNull(threads.deletedAt)))
			.get();

		if (!thread) {
			throw error(404, 'Thread not found');
		}

		if (thread.isLocked) {
			return fail(403, { error: 'This thread is locked.' });
		}

		const bodyHtml = renderMarkdown(bodySource);
		const postId = newId();
		const now = new Date().toISOString();

		await locals.db.insert(posts).values({
			id: postId,
			threadId: thread.id,
			authorUserId: locals.user.id,
			parentPostId,
			bodySource,
			bodyHtml
		});

		// Update thread reply count and last post timestamp
		await locals.db
			.update(threads)
			.set({
				replyCount: thread.replyCount + 1,
				lastPostAt: now,
				updatedAt: now
			})
			.where(_eq(threads.id, thread.id));

		// Auto-subscribe the replier to the thread (if not already)
		const existingSub = await locals.db
			.select()
			.from(subscriptions)
			.where(
				_and(
					_eq(subscriptions.userId, locals.user.id),
					_eq(subscriptions.threadId, thread.id)
				)
			)
			.get();

		if (!existingSub) {
			await locals.db.insert(subscriptions).values({
				id: newId(),
				userId: locals.user.id,
				threadId: thread.id,
				mode: 'immediate'
			});
		}

		// Send notifications to subscribers (excluding the replier)
		if (platform) {
			const subs = await locals.db
				.select({
					userId: subscriptions.userId,
					email: users.email
				})
				.from(subscriptions)
				.innerJoin(users, _eq(subscriptions.userId, users.id))
				.where(
					_and(
						_eq(subscriptions.threadId, thread.id),
						_eq(subscriptions.mode, 'immediate')
					)
				)
				.all();

			const baseUrl = url.origin;
			for (const sub of subs) {
				if (sub.userId === locals.user.id) continue;

				// Create notification event
				await locals.db.insert(notificationEvents).values({
					id: newId(),
					userId: sub.userId,
					eventType: 'reply',
					threadId: thread.id,
					postId,
					status: 'pending'
				});

				// Send email (fire and forget in background)
				const preview = bodySource.substring(0, 200);
				platform.ctx.waitUntil(
					sendReplyNotificationEmail(
						platform,
						sub.email,
						thread.title,
						thread.slug,
						locals.user.displayName,
						preview,
						baseUrl
					)
				);
			}
		}

		return { success: true };
	},

	subscribe: async ({ locals, params }) => {
		if (!locals.user) {
			throw redirect(302, '/auth/login');
		}

		const thread = await locals.db
			.select()
			.from(threads)
			.where(_eq(threads.slug, params.slug))
			.get();

		if (!thread) {
			throw error(404, 'Thread not found');
		}

		const existing = await locals.db
			.select()
			.from(subscriptions)
			.where(
				_and(
					_eq(subscriptions.userId, locals.user.id),
					_eq(subscriptions.threadId, thread.id)
				)
			)
			.get();

		if (existing) {
			// Unsubscribe
			await locals.db.delete(subscriptions).where(_eq(subscriptions.id, existing.id));
		} else {
			// Subscribe
			await locals.db.insert(subscriptions).values({
				id: newId(),
				userId: locals.user.id,
				threadId: thread.id,
				mode: 'immediate'
			});
		}

		return { subscribed: !existing };
	}
};
