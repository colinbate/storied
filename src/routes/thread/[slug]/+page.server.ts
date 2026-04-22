import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	threads,
	posts,
	users,
	subscriptions,
	books,
	series,
	subjectSources,
	threadSubjects,
	sessions,
	moderationEvents,
	type SubjectType
} from '$lib/server/db/schema';
import { eq, and, isNull, asc, inArray, ne } from 'drizzle-orm';
import { newId } from '$lib/server/ids';
import { renderMarkdown } from '$lib/server/markdown';
import { detectSubjectLinks } from '$lib/server/book-links';
import { publishWorkerMessage } from '$lib/server/worker-queue';
import { getOrCreateNotificationPreferences } from '$lib/server/notification-preferences';
import type { SubjectSourceType } from '$shared/worker-messages';

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

	// Load subjects (books or series) linked to this thread
	const subjectLinks = await locals.db
		.select()
		.from(threadSubjects)
		.where(eq(threadSubjects.threadId, thread.thread.id))
		.orderBy(asc(threadSubjects.displayOrder))
		.all();

	const linkedBookIds = subjectLinks
		.filter((l) => l.subjectType === 'book')
		.map((l) => l.subjectId);
	const linkedSeriesIds = subjectLinks
		.filter((l) => l.subjectType === 'series')
		.map((l) => l.subjectId);

	const bookRows = linkedBookIds.length
		? await locals.db
				.select()
				.from(books)
				.where(and(inArray(books.id, linkedBookIds), isNull(books.deletedAt)))
				.all()
		: [];
	const seriesRows = linkedSeriesIds.length
		? await locals.db
				.select()
				.from(series)
				.where(and(inArray(series.id, linkedSeriesIds), isNull(series.deletedAt)))
				.all()
		: [];

	const bookMap = new Map(bookRows.map((b) => [b.id, b]));
	const seriesMap = new Map(seriesRows.map((s) => [s.id, s]));

	// Preserve display_order across both subject kinds.
	const linkedSubjects = subjectLinks
		.map((l) => {
			if (l.subjectType === 'book') {
				const book = bookMap.get(l.subjectId);
				return book ? { kind: 'book' as const, book } : null;
			}
			if (l.subjectType === 'series') {
				const s = seriesMap.get(l.subjectId);
				return s ? { kind: 'series' as const, series: s } : null;
			}
			return null;
		})
		.filter((s): s is NonNullable<typeof s> => s !== null);

	const uniqueBooks = linkedSubjects.filter((s) => s.kind === 'book').map((s) => s.book);

	// Load linked session if present
	let session: {
		id: string;
		slug: string;
		title: string;
		startsAt: string | null;
		themeTitle: string | null;
		theme: string | null;
		locationName: string | null;
	} | null = null;
	if (thread.thread.sessionId) {
		const row = await locals.db
			.select({
				id: sessions.id,
				slug: sessions.slug,
				title: sessions.title,
				startsAt: sessions.startsAt,
				themeTitle: sessions.themeTitle,
				theme: sessions.theme,
				locationName: sessions.locationName
			})
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
		subscriptionMode: (subscription?.mode ?? 'none') as
			| 'immediate'
			| 'daily_digest'
			| 'mute'
			| 'none',
		books: uniqueBooks,
		series: linkedSubjects.filter((s) => s.kind === 'series').map((s) => s.series),
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

		// Auto-subscribe the replier to the thread (if not already), honoring
		// the user's notification preferences.
		const existingSub = await locals.db
			.select()
			.from(subscriptions)
			.where(and(eq(subscriptions.userId, locals.user.id), eq(subscriptions.threadId, thread.id)))
			.get();

		if (!existingSub) {
			const prefs = await getOrCreateNotificationPreferences(locals.db, locals.user.id);
			if (prefs.autoSubscribeOwn) {
				await locals.db.insert(subscriptions).values({
					id: newId(),
					userId: locals.user.id,
					threadId: thread.id,
					mode: prefs.defaultSubMode
				});
			}
		}

		// Detect and process subject links (books and series)
		const detectedLinks = detectSubjectLinks(bodySource);
		for (let i = 0; i < detectedLinks.length; i++) {
			const link = detectedLinks[i];

			const existingSource = await locals.db
				.select()
				.from(subjectSources)
				.where(
					and(
						eq(subjectSources.sourceType, link.sourceType),
						eq(subjectSources.sourceKey, link.sourceKey)
					)
				)
				.get();

			let sourceId: string;
			let resolvedSubjectType: string | null = null;
			let resolvedSubjectId: string | null = null;

			if (existingSource) {
				sourceId = existingSource.id;
				resolvedSubjectType = existingSource.subjectType;
				resolvedSubjectId = existingSource.subjectId;

				// Source exists but not yet resolved — re-enqueue
				if (!resolvedSubjectId) {
					await publishWorkerMessage(platform?.env.WORKER_QUEUE, 'subject.resolve', {
						subjectSourceId: existingSource.id,
						sourceType: link.sourceType as SubjectSourceType,
						sourceUrl: link.url,
						sourceKey: link.sourceKey,
						threadId: thread.id,
						postId
					});
				}
			} else {
				sourceId = newId();
				await locals.db.insert(subjectSources).values({
					id: sourceId,
					sourceType: link.sourceType,
					sourceUrl: link.url,
					sourceKey: link.sourceKey,
					fetchStatus: 'pending'
				});

				// Enqueue for resolution
				await publishWorkerMessage(platform?.env.WORKER_QUEUE, 'subject.resolve', {
					subjectSourceId: sourceId,
					sourceType: link.sourceType as SubjectSourceType,
					sourceUrl: link.url,
					sourceKey: link.sourceKey,
					threadId: thread.id,
					postId
				});
			}

			if (resolvedSubjectType && resolvedSubjectId) {
				await locals.db
					.insert(threadSubjects)
					.values({
						id: newId(),
						threadId: thread.id,
						postId,
						subjectType: resolvedSubjectType as SubjectType,
						subjectId: resolvedSubjectId,
						displayOrder: i,
						context: 'linked',
						addedBy: locals.user.id
					})
					.onConflictDoNothing();
			}
		}

		// Fan out reply notifications in the background worker.
		await publishWorkerMessage(platform?.env.WORKER_QUEUE, 'notifications.thread-reply', {
			threadId: thread.id,
			postId,
			replyAuthorUserId: locals.user.id,
			baseUrl: url.origin
		});

		return { success: true };
	},

	setSubscriptionMode: async ({ locals, params, request }) => {
		if (!locals.user) {
			throw redirect(302, '/auth/login');
		}

		const data = await request.formData();
		const mode = data.get('mode')?.toString();
		if (mode !== 'immediate' && mode !== 'daily_digest' && mode !== 'mute' && mode !== 'none') {
			return fail(400, { error: 'Invalid subscription mode.' });
		}

		const thread = await locals.db
			.select()
			.from(threads)
			.where(eq(threads.slug, params.slug))
			.get();

		if (!thread) {
			throw error(404, 'Thread not found');
		}

		if (mode === 'none') {
			await locals.db
				.delete(subscriptions)
				.where(
					and(eq(subscriptions.userId, locals.user.id), eq(subscriptions.threadId, thread.id))
				);
			return { subscriptionMode: 'none' as const };
		}

		// Upsert via the (user_id, thread_id) unique index.
		const now = new Date().toISOString();
		await locals.db
			.insert(subscriptions)
			.values({
				id: newId(),
				userId: locals.user.id,
				threadId: thread.id,
				mode
			})
			.onConflictDoUpdate({
				target: [subscriptions.userId, subscriptions.threadId],
				set: { mode, updatedAt: now }
			});

		return { subscriptionMode: mode };
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

		const newPinned = thread.isPinned;
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

		const newLocked = thread.isLocked;
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
		const rawSessionThreadRole = data.get('sessionThreadRole')?.toString();
		const sessionThreadRole =
			sessionId && (rawSessionThreadRole === 'primary' || rawSessionThreadRole === 'related')
				? rawSessionThreadRole
				: sessionId
					? 'related'
					: null;
		if (!threadId) return fail(400, { error: 'Missing thread ID.' });

		const thread = await locals.db.select().from(threads).where(eq(threads.id, threadId)).get();
		if (!thread || thread.slug !== params.slug) return fail(404, { error: 'Thread not found.' });

		const now = new Date().toISOString();
		if (sessionId && sessionThreadRole === 'primary') {
			await locals.db
				.update(threads)
				.set({ sessionThreadRole: 'related', updatedAt: now })
				.where(
					and(
						eq(threads.sessionId, sessionId),
						eq(threads.sessionThreadRole, 'primary'),
						ne(threads.id, threadId)
					)
				);
		}
		await locals.db
			.update(threads)
			.set({ sessionId, sessionThreadRole, updatedAt: now })
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
