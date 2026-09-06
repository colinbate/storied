import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { and, asc, eq, isNull, not, or, type SQL } from 'drizzle-orm';

import type { ORM } from '$lib/server/db';
import {
	authors,
	books,
	categories,
	groups,
	moderationEvents,
	posts,
	series,
	sessions,
	sessionSubjects,
	subscriptions,
	threads,
	threadSubjects,
	users,
	type SessionSubjectStatus,
	type SubjectType
} from '$lib/server/db/schema';
import { newId } from '$lib/server/ids';
import { renderMarkdown } from '$lib/server/markdown';
import { listActiveMentionableUsers } from '$lib/server/mentions';
import { createThreadReply } from '$lib/server/thread-replies';
import { PostImageUploadError, readPostImage } from '$lib/server/post-images';
import { canAssignGroup, threadAccessCondition, threadViewer } from '$lib/server/thread-access';
import { publishWorkerMessage } from '$lib/server/worker-queue';
import { loadClassificationsBySubject } from '$lib/server/classifications';
import { sessionAccessCondition } from '$lib/server/session-lifecycle';
import { SESSION_DISCUSSIONS_CATEGORY_ID } from '$lib/server/discussions';

/** How long after posting a user can edit their own post or thread. */
export const POST_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const sessionSubjectStatuses = new Set(['starter', 'featured', 'discussed', 'mentioned_off_theme']);
const subscriptionModes = new Set(['immediate', 'daily_digest', 'mute', 'none']);

export type ThreadRow = typeof threads.$inferSelect;

export function threadSubjectsDependency(threadId: string) {
	return `app:thread-subjects:${threadId}`;
}

function canEditContent(authorId: string, createdAt: string, userId: string | undefined) {
	if (!userId || authorId !== userId) return false;
	const created = Date.parse(createdAt);
	if (Number.isNaN(created)) return false;
	return Date.now() - created < POST_EDIT_WINDOW_MS;
}

function getSessionSubjectStatus(value: FormDataEntryValue | null): SessionSubjectStatus {
	const status = value?.toString();
	return sessionSubjectStatuses.has(status ?? '') ? (status as SessionSubjectStatus) : 'starter';
}

/** Condition selecting the visible, undeleted primary discussion thread for a session. */
export function primarySessionThreadCondition(locals: App.Locals, sessionId: string) {
	return and(
		eq(threads.sessionId, sessionId),
		eq(threads.sessionThreadRole, 'primary'),
		eq(threads.categoryId, SESSION_DISCUSSIONS_CATEGORY_ID),
		isNull(threads.deletedAt),
		threadAccessCondition(locals.db, threadViewer(locals))
	);
}

/** Condition selecting a visible, undeleted thread by slug. */
export function threadSlugCondition(locals: App.Locals, slug: string) {
	return and(
		eq(threads.slug, slug),
		isNull(threads.deletedAt),
		threadAccessCondition(locals.db, threadViewer(locals))
	);
}

/** Load the thread with its author, category, and audience group. */
export async function findThreadRow(db: ORM, condition: SQL | undefined) {
	return db
		.select({
			thread: threads,
			author: {
				id: users.id,
				displayName: users.displayName,
				avatarUrl: users.avatarUrl
			},
			category: {
				id: categories.id,
				name: categories.name,
				slug: categories.slug
			},
			audienceGroup: { id: groups.id, name: groups.name }
		})
		.from(threads)
		.innerJoin(users, eq(threads.authorUserId, users.id))
		.innerJoin(categories, eq(threads.categoryId, categories.id))
		.leftJoin(groups, eq(threads.audienceGroupId, groups.id))
		.where(condition)
		.get();
}

export type ThreadHeadRow = NonNullable<Awaited<ReturnType<typeof findThreadRow>>>;

/**
 * Everything the discussion component needs to render a thread: posts, subscription state,
 * linked subjects (with their session promotion status), the linked session, and moderation
 * option lists. Shared by the thread page and the session page.
 */
export async function loadThreadView(args: {
	locals: App.Locals;
	platform: App.Platform | undefined;
	row: ThreadHeadRow;
	userId: string;
}) {
	const { locals, row } = args;
	const db = locals.db;
	const thread = row.thread;

	const [threadPosts, subscription, bookSubjectRows, seriesSubjectRows, authorSubjectRows] =
		await Promise.all([
			db
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
				.where(and(eq(posts.threadId, thread.id), isNull(posts.deletedAt)))
				.orderBy(asc(posts.createdAt))
				.all(),
			db
				.select()
				.from(subscriptions)
				.where(and(eq(subscriptions.userId, args.userId), eq(subscriptions.threadId, thread.id)))
				.get(),
			db
				.select({ link: threadSubjects, book: books })
				.from(threadSubjects)
				.innerJoin(books, eq(threadSubjects.subjectId, books.id))
				.where(
					and(
						eq(threadSubjects.threadId, thread.id),
						eq(threadSubjects.subjectType, 'book'),
						isNull(books.deletedAt)
					)
				)
				.orderBy(asc(threadSubjects.displayOrder))
				.all(),
			db
				.select({ link: threadSubjects, series })
				.from(threadSubjects)
				.innerJoin(series, eq(threadSubjects.subjectId, series.id))
				.where(
					and(
						eq(threadSubjects.threadId, thread.id),
						eq(threadSubjects.subjectType, 'series'),
						isNull(series.deletedAt)
					)
				)
				.orderBy(asc(threadSubjects.displayOrder))
				.all(),
			db
				.select({ link: threadSubjects, author: authors })
				.from(threadSubjects)
				.innerJoin(authors, eq(threadSubjects.subjectId, authors.id))
				.where(
					and(
						eq(threadSubjects.threadId, thread.id),
						eq(threadSubjects.subjectType, 'author'),
						isNull(authors.deletedAt)
					)
				)
				.orderBy(asc(threadSubjects.displayOrder))
				.all()
		]);

	const [bookClassifications, seriesClassifications] = await Promise.all([
		loadClassificationsBySubject(
			db,
			'book',
			bookSubjectRows.map(({ book }) => book.id)
		),
		loadClassificationsBySubject(
			db,
			'series',
			seriesSubjectRows.map(({ series }) => series.id)
		)
	]);

	// Preserve display_order across all subject kinds.
	const linkedSubjects = [
		...bookSubjectRows.map(({ link, book }) => ({
			kind: 'book' as const,
			link,
			book: { ...book, classifications: bookClassifications[book.id] ?? [] }
		})),
		...seriesSubjectRows.map(({ link, series }) => ({
			kind: 'series' as const,
			link,
			series: { ...series, classifications: seriesClassifications[series.id] ?? [] }
		})),
		...authorSubjectRows.map(({ link, author }) => ({ kind: 'author' as const, link, author }))
	].sort((a, b) => a.link.displayOrder - b.link.displayOrder);

	const session = thread.sessionId
		? ((await db
				.select({
					id: sessions.id,
					slug: sessions.slug,
					title: sessions.title,
					startsAt: sessions.startsAt,
					timezone: sessions.timezone,
					themeTitle: sessions.themeTitle,
					theme: sessions.theme,
					locationName: sessions.locationName
				})
				.from(sessions)
				.where(eq(sessions.id, thread.sessionId))
				.get()) ?? null)
		: null;

	const sessionSubjectRows =
		thread.sessionId && linkedSubjects.length
			? await db
					.select()
					.from(sessionSubjects)
					.where(eq(sessionSubjects.sessionId, thread.sessionId))
					.all()
			: [];
	const sessionSubjectMap = new Map(
		sessionSubjectRows.map((link) => [`${link.subjectType}:${link.subjectId}`, link])
	);

	const canModerate = locals.permissions.has('moderate');
	const canPromoteBooks = locals.permissions.has('book:promote');
	const canManageGroups = locals.permissions.has('groups:edit');
	const canManageSessions = locals.permissions.has('sessions:edit');

	const [allSessions, allAudienceGroups] = await Promise.all([
		canModerate && canManageSessions && thread.sessionThreadRole !== 'primary'
			? db
					.select({ id: sessions.id, title: sessions.title })
					.from(sessions)
					.where(sessionAccessCondition(locals))
					.orderBy(asc(sessions.title))
					.all()
			: [],
		canManageGroups
			? db
					.select({ id: groups.id, name: groups.name, archivedAt: groups.archivedAt })
					.from(groups)
					.where(
						or(
							isNull(groups.archivedAt),
							thread.audienceGroupId ? eq(groups.id, thread.audienceGroupId) : undefined
						)
					)
					.orderBy(asc(groups.name))
					.all()
			: []
	]);

	return {
		thread,
		author: row.author,
		category: row.category,
		audienceGroup: row.audienceGroup,
		posts: threadPosts,
		subscriptionMode: (subscription?.mode ?? 'none') as
			| 'immediate'
			| 'daily_digest'
			| 'mute'
			| 'none',
		books: linkedSubjects
			.filter((s) => s.kind === 'book')
			.map((s) => ({
				book: s.book,
				sessionSubject: sessionSubjectMap.get(`book:${s.book.id}`) ?? null
			})),
		series: linkedSubjects
			.filter((s) => s.kind === 'series')
			.map((s) => ({
				series: s.series,
				sessionSubject: sessionSubjectMap.get(`series:${s.series.id}`) ?? null
			})),
		authors: linkedSubjects
			.filter((s) => s.kind === 'author')
			.map((s) => ({
				author: s.author,
				sessionSubject: sessionSubjectMap.get(`author:${s.author.id}`) ?? null
			})),
		session,
		canModerate,
		canPromoteBooks,
		canManageGroups,
		canManageSessions,
		allSessions,
		allAudienceGroups,
		postEditWindowMs: POST_EDIT_WINDOW_MS,
		fileBaseUrl: args.platform?.env.FILE_BASE_URL ?? ''
	};
}

export type ThreadViewData = Awaited<ReturnType<typeof loadThreadView>>;

type ThreadResolver = (event: RequestEvent) => Promise<ThreadRow | null | undefined>;

/**
 * Form actions for a discussion thread. `resolveThread` maps the request to the thread the
 * route is about (by slug on the thread page, by session on the session page), so the same
 * actions serve both contexts.
 */
export function createThreadActions(options: {
	resolveThread: ThreadResolver;
	afterDelete: (event: RequestEvent) => string;
}) {
	async function requireThread(event: RequestEvent) {
		const thread = await options.resolveThread(event);
		if (!thread) throw error(404, 'Thread not found');
		return thread;
	}

	async function moderationEvent(
		locals: App.Locals,
		targetType: 'thread' | 'post',
		targetId: string,
		action: string,
		reason?: string
	) {
		await locals.db.insert(moderationEvents).values({
			id: newId(),
			actorUserId: locals.user!.id,
			targetType,
			targetId,
			action,
			reason
		});
	}

	return {
		reply: async (event: RequestEvent) => {
			const { request, locals, platform, url } = event;
			if (!locals.user) throw redirect(302, '/auth/login');

			const data = await request.formData();
			const bodySource = data.get('body')?.toString()?.trim();
			const parentPostId = data.get('parentPostId')?.toString() || null;
			const imageInput = readPostImage(data);

			if (!bodySource) return fail(400, { error: 'Reply cannot be empty.' });
			if (imageInput.error) return fail(400, { error: imageInput.error });

			const thread = await requireThread(event);
			if (thread.isLocked) return fail(403, { error: 'This thread is locked.' });

			try {
				const { queuedSubjectLinks } = await createThreadReply({
					db: locals.db,
					platform,
					thread,
					authorUserId: locals.user.id,
					bodySource,
					parentPostId,
					baseUrl: url.origin,
					processSubjectLinks: true,
					imageFile: imageInput.file
				});
				return { success: true, queuedSubjectLinks };
			} catch (err) {
				if (err instanceof PostImageUploadError) {
					return fail(500, { error: 'The image could not be uploaded. Please try again.' });
				}
				throw err;
			}
		},

		setSubscriptionMode: async (event: RequestEvent) => {
			const { locals, request } = event;
			if (!locals.user) throw redirect(302, '/auth/login');

			const mode = (await request.formData()).get('mode')?.toString();
			if (!mode || !subscriptionModes.has(mode)) {
				return fail(400, { error: 'Invalid subscription mode.' });
			}

			const thread = await requireThread(event);

			if (mode === 'none') {
				await locals.db
					.delete(subscriptions)
					.where(
						and(eq(subscriptions.userId, locals.user.id), eq(subscriptions.threadId, thread.id))
					);
				return { subscriptionMode: 'none' as const };
			}

			const now = new Date().toISOString();
			await locals.db
				.insert(subscriptions)
				.values({ id: newId(), userId: locals.user.id, threadId: thread.id, mode })
				.onConflictDoUpdate({
					target: [subscriptions.userId, subscriptions.threadId],
					set: { mode, updatedAt: now }
				});

			return { subscriptionMode: mode as 'immediate' | 'daily_digest' | 'mute' };
		},

		togglePin: async (event: RequestEvent) => {
			const { locals } = event;
			if (!locals.permissions.has('moderate')) return fail(403, { error: 'Not allowed.' });
			const thread = await requireThread(event);

			const now = new Date().toISOString();
			const [updated] = await locals.db
				.update(threads)
				.set({ isPinned: not(threads.isPinned), updatedAt: now })
				.where(eq(threads.id, thread.id))
				.returning();

			await moderationEvent(locals, 'thread', thread.id, updated.isPinned ? 'pin' : 'unpin');
			return { success: true };
		},

		toggleLock: async (event: RequestEvent) => {
			const { locals } = event;
			if (!locals.permissions.has('moderate')) return fail(403, { error: 'Not allowed.' });
			const thread = await requireThread(event);

			const now = new Date().toISOString();
			const [updated] = await locals.db
				.update(threads)
				.set({ isLocked: not(threads.isLocked), updatedAt: now })
				.where(eq(threads.id, thread.id))
				.returning();

			await moderationEvent(locals, 'thread', thread.id, updated.isLocked ? 'lock' : 'unlock');
			return { success: true };
		},

		linkSession: async (event: RequestEvent) => {
			const { locals, request } = event;
			if (!locals.permissions.has('moderate') || !locals.permissions.has('sessions:edit')) {
				return fail(403, { error: 'Not allowed.' });
			}
			const thread = await requireThread(event);
			if (thread.sessionThreadRole === 'primary') {
				return fail(400, { error: 'A session’s main discussion cannot be moved.' });
			}

			const rawSessionId = (await request.formData()).get('sessionId')?.toString();
			const sessionId = rawSessionId && rawSessionId.length > 0 ? rawSessionId : null;

			if (sessionId) {
				const session = await locals.db
					.select({ id: sessions.id })
					.from(sessions)
					.where(and(eq(sessions.id, sessionId), sessionAccessCondition(locals)))
					.get();
				if (!session) return fail(404, { error: 'Session not found.' });
			}

			const now = new Date().toISOString();
			await locals.db
				.update(threads)
				.set({ sessionId, sessionThreadRole: sessionId ? 'related' : null, updatedAt: now })
				.where(eq(threads.id, thread.id));

			await moderationEvent(
				locals,
				'thread',
				thread.id,
				sessionId ? 'link_session' : 'unlink_session',
				sessionId ?? undefined
			);
			return { success: true };
		},

		setAudienceGroup: async (event: RequestEvent) => {
			const { locals, request, platform } = event;
			if (!locals.permissions.has('groups:edit')) return fail(403, { error: 'Not allowed.' });
			if (!locals.user) return fail(401, { error: 'Missing current user.' });
			const thread = await requireThread(event);

			const audienceGroupId = (await request.formData()).get('audienceGroupId')?.toString() || null;
			if (
				audienceGroupId &&
				!(await canAssignGroup(locals.db, threadViewer(locals), audienceGroupId))
			) {
				return fail(400, { error: 'That group is unavailable.' });
			}

			const now = new Date().toISOString();
			await locals.db
				.update(threads)
				.set({ audienceGroupId, updatedAt: now })
				.where(eq(threads.id, thread.id));

			await moderationEvent(
				locals,
				'thread',
				thread.id,
				'audience_update',
				audienceGroupId ?? 'all_members'
			);
			if (thread.sessionId) {
				await publishWorkerMessage(platform?.env.STORIED_WORKER, 'search.session.reindex', {
					sessionId: thread.sessionId
				});
			}

			return { audienceUpdated: true };
		},

		promoteSessionSubject: async (event: RequestEvent) => {
			const { locals, request } = event;
			if (!locals.permissions.has('book:promote')) return fail(403, { error: 'Not allowed.' });

			const data = await request.formData();
			const subjectType = data.get('subjectType')?.toString() as SubjectType | undefined;
			const subjectId = data.get('subjectId')?.toString();
			const status = getSessionSubjectStatus(data.get('status'));
			if (!subjectId || !subjectType || !['book', 'series', 'author'].includes(subjectType)) {
				return fail(400, { error: 'Missing subject reference.' });
			}

			const thread = await requireThread(event);
			if (!thread.sessionId) {
				return fail(400, { error: 'This thread is not linked to a session.' });
			}

			const threadSubject = await locals.db
				.select()
				.from(threadSubjects)
				.where(
					and(
						eq(threadSubjects.threadId, thread.id),
						eq(threadSubjects.subjectType, subjectType),
						eq(threadSubjects.subjectId, subjectId)
					)
				)
				.get();
			if (!threadSubject) return fail(404, { error: 'Subject is not linked to this thread.' });

			const subjectCondition = and(
				eq(sessionSubjects.sessionId, thread.sessionId),
				eq(sessionSubjects.subjectType, subjectType),
				eq(sessionSubjects.subjectId, subjectId)
			);
			const existing = await locals.db.select().from(sessionSubjects).where(subjectCondition).get();

			const now = new Date().toISOString();
			if (existing) {
				await locals.db
					.update(sessionSubjects)
					.set({ status, updatedAt: now })
					.where(subjectCondition);
			} else {
				await locals.db.insert(sessionSubjects).values({
					sessionId: thread.sessionId,
					subjectType,
					subjectId,
					status,
					addedByUserId: locals.user?.id ?? null
				});
			}

			return { sessionSubjectPromoted: true };
		},

		unlinkSessionSubject: async (event: RequestEvent) => {
			const { locals, request } = event;
			if (!locals.permissions.has('book:promote')) return fail(403, { error: 'Not allowed.' });

			const data = await request.formData();
			const subjectType = data.get('subjectType')?.toString() as SubjectType | undefined;
			const subjectId = data.get('subjectId')?.toString();
			if (!subjectId || !subjectType || !['book', 'series', 'author'].includes(subjectType)) {
				return fail(400, { error: 'Missing subject reference.' });
			}

			const thread = await requireThread(event);
			if (!thread.sessionId) {
				return fail(400, { error: 'This thread is not linked to a session.' });
			}

			await locals.db
				.delete(sessionSubjects)
				.where(
					and(
						eq(sessionSubjects.sessionId, thread.sessionId),
						eq(sessionSubjects.subjectType, subjectType),
						eq(sessionSubjects.subjectId, subjectId)
					)
				);

			return { sessionSubjectUnlinked: true };
		},

		deleteThread: async (event: RequestEvent) => {
			const { locals } = event;
			if (!locals.permissions.has('moderate')) return fail(403, { error: 'Not allowed.' });
			const thread = await requireThread(event);

			const now = new Date().toISOString();
			await locals.db
				.update(threads)
				.set({ deletedAt: now, updatedAt: now })
				.where(eq(threads.id, thread.id));

			await moderationEvent(locals, 'thread', thread.id, 'soft_delete');
			throw redirect(303, options.afterDelete(event));
		},

		deletePost: async (event: RequestEvent) => {
			const { locals, request } = event;
			if (!locals.permissions.has('moderate')) return fail(403, { error: 'Not allowed.' });

			const postId = (await request.formData()).get('postId')?.toString();
			if (!postId) return fail(400, { error: 'Missing post ID.' });

			const thread = await requireThread(event);
			const post = await locals.db
				.select()
				.from(posts)
				.where(and(eq(posts.id, postId), eq(posts.threadId, thread.id), isNull(posts.deletedAt)))
				.get();
			if (!post) return fail(404, { error: 'Post not found.' });

			const now = new Date().toISOString();
			await locals.db
				.update(posts)
				.set({ deletedAt: now, updatedAt: now })
				.where(eq(posts.id, postId));
			await locals.db
				.update(threads)
				.set({ replyCount: Math.max(0, thread.replyCount - 1), updatedAt: now })
				.where(eq(threads.id, thread.id));

			await moderationEvent(locals, 'post', postId, 'soft_delete');
			return { success: true };
		},

		editThread: async (event: RequestEvent) => {
			const { locals, request } = event;
			if (!locals.user) throw redirect(302, '/auth/login');

			const body = (await request.formData()).get('body')?.toString()?.trim();
			if (!body) return fail(400, { error: 'Content cannot be empty.' });

			const thread = await requireThread(event);
			if (!canEditContent(thread.authorUserId, thread.createdAt, locals.user.id)) {
				return fail(403, { error: 'Edit window has passed.' });
			}

			const bodyHtml = renderMarkdown(body, {
				mentionableUsers: await listActiveMentionableUsers(locals.db, thread.audienceGroupId)
			});
			const now = new Date().toISOString();
			await locals.db
				.update(threads)
				.set({ bodySource: body, bodyHtml, updatedAt: now })
				.where(eq(threads.id, thread.id));

			return { edited: true };
		},

		editPost: async (event: RequestEvent) => {
			const { locals, request } = event;
			if (!locals.user) throw redirect(302, '/auth/login');

			const data = await request.formData();
			const postId = data.get('postId')?.toString();
			const body = data.get('body')?.toString()?.trim();
			if (!postId) return fail(400, { error: 'Missing post ID.' });
			if (!body) return fail(400, { error: 'Content cannot be empty.' });

			const thread = await requireThread(event);
			const post = await locals.db
				.select()
				.from(posts)
				.where(and(eq(posts.id, postId), eq(posts.threadId, thread.id), isNull(posts.deletedAt)))
				.get();
			if (!post) return fail(404, { error: 'Post not found.' });

			if (!canEditContent(post.authorUserId, post.createdAt, locals.user.id)) {
				return fail(403, { error: 'Edit window has passed.' });
			}

			const bodyHtml = renderMarkdown(body, {
				mentionableUsers: await listActiveMentionableUsers(locals.db, thread.audienceGroupId)
			});
			const now = new Date().toISOString();
			await locals.db
				.update(posts)
				.set({ bodySource: body, bodyHtml, editCount: post.editCount + 1, updatedAt: now })
				.where(eq(posts.id, postId));

			return { edited: true };
		}
	};
}
