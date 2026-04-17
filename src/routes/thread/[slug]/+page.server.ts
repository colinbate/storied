import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	threads,
	posts,
	users,
	subscriptions,
	notificationEvents,
	books,
	bookSources,
	postBooks,
	sessions,
	moderationEvents
} from '$lib/server/db/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { newId } from '$lib/server/ids';
import { renderMarkdown } from '$lib/server/markdown';
import { sendReplyNotificationEmail } from '$lib/server/email';
import { detectBookLinks } from '$lib/server/book-links';

/** How long after posting a user can edit their own post or thread. */
const POST_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function canEditContent(authorId: string, createdAt: string, userId: string | undefined) {
	if (!userId || authorId !== userId) return false;
	const created = Date.parse(createdAt);
	if (Number.isNaN(created)) return false;
	return Date.now() - created < POST_EDIT_WINDOW_MS;
}

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
		.innerJoin(users, eq(threads.authorUserId, users.id))
		.where(and(eq(threads.slug, params.slug), isNull(threads.deletedAt)))
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
		.innerJoin(users, eq(posts.authorUserId, users.id))
		.where(and(eq(posts.threadId, thread.thread.id), isNull(posts.deletedAt)))
		.orderBy(asc(posts.createdAt))
		.all();

	// Check if user is subscribed
	const subscription = await locals.db
		.select()
		.from(subscriptions)
		.where(
			and(eq(subscriptions.userId, locals.user.id), eq(subscriptions.threadId, thread.thread.id))
		)
		.get();

	// Load books linked to this thread
	const threadBooks = await locals.db
		.select({
			book: books,
			postBook: postBooks
		})
		.from(postBooks)
		.innerJoin(books, eq(postBooks.bookId, books.id))
		.where(eq(postBooks.threadId, thread.thread.id))
		.orderBy(asc(postBooks.displayOrder))
		.all();

	// Deduplicate books (same book might be linked from multiple posts)
	const seenBookIds = new Set<string>();
	const uniqueBooks = threadBooks
		.filter(({ book }) => {
			if (seenBookIds.has(book.id)) return false;
			seenBookIds.add(book.id);
			return true;
		})
		.map(({ book }) => book);

	// Load linked session if present
	let session: { id: string; slug: string; title: string } | null = null;
	if (thread.thread.sessionId) {
		const row = await locals.db
			.select({ id: sessions.id, slug: sessions.slug, title: sessions.title })
			.from(sessions)
			.where(eq(sessions.id, thread.thread.sessionId))
			.get();
		session = row ?? null;
	}

	const canModerate = locals.permissions.has('moderate');
	let allSessions: { id: string; title: string }[] = [];
	if (canModerate) {
		allSessions = await locals.db
			.select({ id: sessions.id, title: sessions.title })
			.from(sessions)
			.orderBy(asc(sessions.title))
			.all();
	}

	return {
		thread: thread.thread,
		author: thread.author,
		posts: threadPosts,
		isSubscribed: !!subscription,
		books: uniqueBooks,
		session,
		canModerate,
		allSessions,
		postEditWindowMs: POST_EDIT_WINDOW_MS
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
			.where(and(eq(threads.slug, params.slug), isNull(threads.deletedAt)))
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
			.where(eq(threads.id, thread.id));

		// Auto-subscribe the replier to the thread (if not already)
		const existingSub = await locals.db
			.select()
			.from(subscriptions)
			.where(and(eq(subscriptions.userId, locals.user.id), eq(subscriptions.threadId, thread.id)))
			.get();

		if (!existingSub) {
			await locals.db.insert(subscriptions).values({
				id: newId(),
				userId: locals.user.id,
				threadId: thread.id,
				mode: 'immediate'
			});
		}

		// Detect and process book links
		const detectedLinks = detectBookLinks(bodySource);
		for (let i = 0; i < detectedLinks.length; i++) {
			const link = detectedLinks[i];

			const existingSource = await locals.db
				.select()
				.from(bookSources)
				.where(
					and(
						eq(bookSources.sourceType, link.sourceType),
						eq(bookSources.sourceKey, link.sourceKey)
					)
				)
				.get();

			let sourceId: string;
			let bookId: string | null = null;

			if (existingSource) {
				sourceId = existingSource.id;
				bookId = existingSource.canonicalBookId;

				// Source exists but not yet resolved — re-enqueue
				if (!bookId && platform?.env.BOOK_QUEUE) {
					await platform.env.BOOK_QUEUE.send({
						bookSourceId: existingSource.id,
						sourceType: link.sourceType,
						sourceUrl: link.url,
						sourceKey: link.sourceKey,
						threadId: thread.id,
						postId
					});
				}
			} else {
				sourceId = newId();
				await locals.db.insert(bookSources).values({
					id: sourceId,
					sourceType: link.sourceType,
					sourceUrl: link.url,
					sourceKey: link.sourceKey,
					fetchStatus: 'pending'
				});

				// Enqueue for resolution
				if (platform?.env.BOOK_QUEUE) {
					await platform.env.BOOK_QUEUE.send({
						bookSourceId: sourceId,
						sourceType: link.sourceType,
						sourceUrl: link.url,
						sourceKey: link.sourceKey,
						threadId: thread.id,
						postId
					});
				}
			}

			if (bookId) {
				await locals.db.insert(postBooks).values({
					id: newId(),
					postId,
					threadId: thread.id,
					bookId,
					bookSourceId: sourceId,
					displayOrder: i,
					context: 'linked'
				});
			}
		}

		// Send notifications to subscribers (excluding the replier)
		if (platform) {
			const subs = await locals.db
				.select({
					userId: subscriptions.userId,
					email: users.email
				})
				.from(subscriptions)
				.innerJoin(users, eq(subscriptions.userId, users.id))
				.where(and(eq(subscriptions.threadId, thread.id), eq(subscriptions.mode, 'immediate')))
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
			.where(eq(threads.slug, params.slug))
			.get();

		if (!thread) {
			throw error(404, 'Thread not found');
		}

		const existing = await locals.db
			.select()
			.from(subscriptions)
			.where(and(eq(subscriptions.userId, locals.user.id), eq(subscriptions.threadId, thread.id)))
			.get();

		if (existing) {
			// Unsubscribe
			await locals.db.delete(subscriptions).where(eq(subscriptions.id, existing.id));
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
	},

	togglePin: async ({ request, locals, params }) => {
		if (!locals.permissions.has('moderate')) {
			return fail(403, { error: 'Not allowed.' });
		}

		const data = await request.formData();
		const threadId = data.get('threadId')?.toString();
		if (!threadId) return fail(400, { error: 'Missing thread ID.' });

		const thread = await locals.db.select().from(threads).where(eq(threads.id, threadId)).get();
		if (!thread || thread.slug !== params.slug) return fail(404, { error: 'Thread not found.' });

		const newPinned = thread.isPinned ? 0 : 1;
		const now = new Date().toISOString();
		await locals.db
			.update(threads)
			.set({ isPinned: newPinned, updatedAt: now })
			.where(eq(threads.id, threadId));

		await locals.db.insert(moderationEvents).values({
			id: newId(),
			actorUserId: locals.user!.id,
			targetType: 'thread',
			targetId: threadId,
			action: newPinned ? 'pin' : 'unpin'
		});

		return { success: true };
	},

	toggleLock: async ({ request, locals, params }) => {
		if (!locals.permissions.has('moderate')) {
			return fail(403, { error: 'Not allowed.' });
		}

		const data = await request.formData();
		const threadId = data.get('threadId')?.toString();
		if (!threadId) return fail(400, { error: 'Missing thread ID.' });

		const thread = await locals.db.select().from(threads).where(eq(threads.id, threadId)).get();
		if (!thread || thread.slug !== params.slug) return fail(404, { error: 'Thread not found.' });

		const newLocked = thread.isLocked ? 0 : 1;
		const now = new Date().toISOString();
		await locals.db
			.update(threads)
			.set({ isLocked: newLocked, updatedAt: now })
			.where(eq(threads.id, threadId));

		await locals.db.insert(moderationEvents).values({
			id: newId(),
			actorUserId: locals.user!.id,
			targetType: 'thread',
			targetId: threadId,
			action: newLocked ? 'lock' : 'unlock'
		});

		return { success: true };
	},

	linkSession: async ({ request, locals, params }) => {
		if (!locals.permissions.has('moderate')) {
			return fail(403, { error: 'Not allowed.' });
		}

		const data = await request.formData();
		const threadId = data.get('threadId')?.toString();
		const rawSessionId = data.get('sessionId')?.toString();
		const sessionId = rawSessionId && rawSessionId.length > 0 ? rawSessionId : null;
		if (!threadId) return fail(400, { error: 'Missing thread ID.' });

		const thread = await locals.db.select().from(threads).where(eq(threads.id, threadId)).get();
		if (!thread || thread.slug !== params.slug) return fail(404, { error: 'Thread not found.' });

		const now = new Date().toISOString();
		await locals.db
			.update(threads)
			.set({ sessionId, updatedAt: now })
			.where(eq(threads.id, threadId));

		await locals.db.insert(moderationEvents).values({
			id: newId(),
			actorUserId: locals.user!.id,
			targetType: 'thread',
			targetId: threadId,
			action: sessionId ? 'link_session' : 'unlink_session',
			reason: sessionId ?? undefined
		});

		return { success: true };
	},

	deleteThread: async ({ request, locals, params }) => {
		if (!locals.permissions.has('moderate')) {
			return fail(403, { error: 'Not allowed.' });
		}

		const data = await request.formData();
		const threadId = data.get('threadId')?.toString();
		if (!threadId) return fail(400, { error: 'Missing thread ID.' });

		const thread = await locals.db.select().from(threads).where(eq(threads.id, threadId)).get();
		if (!thread || thread.slug !== params.slug) return fail(404, { error: 'Thread not found.' });

		const now = new Date().toISOString();
		await locals.db
			.update(threads)
			.set({ deletedAt: now, updatedAt: now })
			.where(eq(threads.id, threadId));

		await locals.db.insert(moderationEvents).values({
			id: newId(),
			actorUserId: locals.user!.id,
			targetType: 'thread',
			targetId: threadId,
			action: 'soft_delete'
		});

		throw redirect(303, '/');
	},

	deletePost: async ({ request, locals, params }) => {
		if (!locals.permissions.has('moderate')) {
			return fail(403, { error: 'Not allowed.' });
		}

		const data = await request.formData();
		const postId = data.get('postId')?.toString();
		if (!postId) return fail(400, { error: 'Missing post ID.' });

		const post = await locals.db.select().from(posts).where(eq(posts.id, postId)).get();
		if (!post) return fail(404, { error: 'Post not found.' });

		const thread = await locals.db
			.select()
			.from(threads)
			.where(eq(threads.id, post.threadId))
			.get();
		if (!thread || thread.slug !== params.slug)
			return fail(404, { error: 'Post not in this thread.' });

		const now = new Date().toISOString();
		await locals.db
			.update(posts)
			.set({ deletedAt: now, updatedAt: now })
			.where(eq(posts.id, postId));

		await locals.db
			.update(threads)
			.set({ replyCount: Math.max(0, thread.replyCount - 1), updatedAt: now })
			.where(eq(threads.id, thread.id));

		await locals.db.insert(moderationEvents).values({
			id: newId(),
			actorUserId: locals.user!.id,
			targetType: 'post',
			targetId: postId,
			action: 'soft_delete'
		});

		return { success: true };
	},

	editThread: async ({ request, locals, params }) => {
		if (!locals.user) {
			throw redirect(302, '/auth/login');
		}

		const data = await request.formData();
		const body = data.get('body')?.toString()?.trim();
		if (!body) {
			return fail(400, { error: 'Content cannot be empty.' });
		}

		const thread = await locals.db
			.select()
			.from(threads)
			.where(and(eq(threads.slug, params.slug), isNull(threads.deletedAt)))
			.get();
		if (!thread) throw error(404, 'Thread not found');

		if (!canEditContent(thread.authorUserId, thread.createdAt, locals.user.id)) {
			return fail(403, { error: 'Edit window has passed.' });
		}

		const bodyHtml = renderMarkdown(body);
		const now = new Date().toISOString();
		await locals.db
			.update(threads)
			.set({ bodySource: body, bodyHtml, updatedAt: now })
			.where(eq(threads.id, thread.id));

		return { edited: true };
	},

	editPost: async ({ request, locals, params }) => {
		if (!locals.user) {
			throw redirect(302, '/auth/login');
		}

		const data = await request.formData();
		const postId = data.get('postId')?.toString();
		const body = data.get('body')?.toString()?.trim();
		if (!postId) return fail(400, { error: 'Missing post ID.' });
		if (!body) return fail(400, { error: 'Content cannot be empty.' });

		const post = await locals.db.select().from(posts).where(eq(posts.id, postId)).get();
		if (!post) return fail(404, { error: 'Post not found.' });

		const thread = await locals.db
			.select()
			.from(threads)
			.where(eq(threads.id, post.threadId))
			.get();
		if (!thread || thread.slug !== params.slug) return fail(404, { error: 'Post not found.' });

		if (!canEditContent(post.authorUserId, post.createdAt, locals.user.id)) {
			return fail(403, { error: 'Edit window has passed.' });
		}

		const bodyHtml = renderMarkdown(body);
		const now = new Date().toISOString();
		await locals.db
			.update(posts)
			.set({
				bodySource: body,
				bodyHtml,
				editCount: post.editCount + 1,
				updatedAt: now
			})
			.where(eq(posts.id, postId));

		return { edited: true };
	}
};
