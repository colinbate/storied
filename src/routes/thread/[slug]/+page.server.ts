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
	sessions
} from '$lib/server/db/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { newId } from '$lib/server/ids';
import { renderMarkdown } from '$lib/server/markdown';
import { sendReplyNotificationEmail } from '$lib/server/email';
import { detectBookLinks } from '$lib/server/book-links';

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
			_and(_eq(subscriptions.userId, locals.user.id), _eq(subscriptions.threadId, thread.thread.id))
		)
		.get();

	// Load books linked to this thread
	const threadBooks = await locals.db
		.select({
			book: books,
			postBook: postBooks
		})
		.from(postBooks)
		.innerJoin(books, _eq(postBooks.bookId, books.id))
		.where(_eq(postBooks.threadId, thread.thread.id))
		.orderBy(_asc(postBooks.displayOrder))
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
			.where(_eq(sessions.id, thread.thread.sessionId))
			.get();
		session = row ?? null;
	}

	return {
		thread: thread.thread,
		author: thread.author,
		posts: threadPosts,
		isSubscribed: !!subscription,
		books: uniqueBooks,
		session
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
				_and(_eq(subscriptions.userId, locals.user.id), _eq(subscriptions.threadId, thread.id))
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

		// Detect and process book links
		const detectedLinks = detectBookLinks(bodySource);
		for (let i = 0; i < detectedLinks.length; i++) {
			const link = detectedLinks[i];

			const existingSource = await locals.db
				.select()
				.from(bookSources)
				.where(
					_and(
						_eq(bookSources.sourceType, link.sourceType),
						_eq(bookSources.sourceKey, link.sourceKey)
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
				.innerJoin(users, _eq(subscriptions.userId, users.id))
				.where(_and(_eq(subscriptions.threadId, thread.id), _eq(subscriptions.mode, 'immediate')))
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
				_and(_eq(subscriptions.userId, locals.user.id), _eq(subscriptions.threadId, thread.id))
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
