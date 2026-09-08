import { and, asc, count, eq, isNull, ne, sql } from 'drizzle-orm';

import type { ORM } from '$lib/server/db';
import { categories, notificationPreferences, threads } from '$lib/server/db/schema';
import { newId } from '$lib/server/ids';
import { renderMarkdown } from '$lib/server/markdown';
import { slugify } from '$lib/server/slugify';
import {
	threadAccessBindings,
	threadAccessCondition,
	threadAccessSql,
	type ThreadViewer
} from '$lib/server/thread-access';

export const SESSION_DISCUSSIONS_CATEGORY_ID = 'cat_session_discussions';
export const ANNOUNCEMENTS_CATEGORY_ID = 'cat_announcements';

export async function withThreadReadContext<T extends { thread: { id: string } }>(
	db: ORM,
	userId: string | null,
	items: T[]
): Promise<Array<T & { unreadCount: number; firstUnreadPostId: string | null }>> {
	if (!userId || items.length === 0) {
		return items.map((item) => ({ ...item, unreadCount: 0, firstUnreadPostId: null }));
	}

	const threadIdsJson = JSON.stringify(items.map((item) => item.thread.id));
	const rows = await db.all<{
		threadId: string;
		unreadCount: number;
		firstUnreadPostId: string | null;
	}>(sql`
		SELECT
			candidate.value AS threadId,
			CASE WHEN read_state.user_id IS NULL THEN 0 ELSE (
				SELECT COUNT(*)
				FROM posts unread_post
				WHERE unread_post.thread_id = candidate.value
					AND unread_post.deleted_at IS NULL
					AND unread_post.author_user_id <> ${userId}
					AND (
						unread_post.created_at > read_state.last_read_post_created_at
						OR (
							unread_post.created_at = read_state.last_read_post_created_at
							AND unread_post.id > COALESCE(read_state.last_read_post_id, '')
						)
					)
			) END AS unreadCount,
			CASE WHEN read_state.user_id IS NULL THEN NULL ELSE (
				SELECT unread_post.id
				FROM posts unread_post
				WHERE unread_post.thread_id = candidate.value
					AND unread_post.deleted_at IS NULL
					AND unread_post.author_user_id <> ${userId}
					AND (
						unread_post.created_at > read_state.last_read_post_created_at
						OR (
							unread_post.created_at = read_state.last_read_post_created_at
							AND unread_post.id > COALESCE(read_state.last_read_post_id, '')
						)
					)
				ORDER BY unread_post.created_at, unread_post.id
				LIMIT 1
			) END AS firstUnreadPostId
		FROM json_each(${threadIdsJson}) candidate
		LEFT JOIN thread_read_states read_state
			ON read_state.thread_id = candidate.value
			AND read_state.user_id = ${userId}
	`);
	const contextByThreadId = new Map(rows.map((row) => [row.threadId, row]));

	return items.map((item) => {
		const context = contextByThreadId.get(item.thread.id);
		return {
			...item,
			unreadCount: Number(context?.unreadCount ?? 0),
			firstUnreadPostId: context?.firstUnreadPostId ?? null
		};
	});
}

export async function listDiscussionCategories(db: ORM, viewer: ThreadViewer) {
	return db
		.select({
			id: categories.id,
			name: categories.name,
			slug: categories.slug,
			description: categories.description,
			size: count(threads.id).as('size')
		})
		.from(categories)
		.leftJoin(
			threads,
			and(
				eq(threads.categoryId, categories.id),
				isNull(threads.deletedAt),
				threadAccessCondition(db, viewer)
			)
		)
		.where(and(eq(categories.isPrivate, false), ne(categories.id, SESSION_DISCUSSIONS_CATEGORY_ID)))
		.groupBy(
			categories.id,
			categories.name,
			categories.slug,
			categories.description,
			categories.sortOrder
		)
		.orderBy(asc(categories.sortOrder), asc(categories.name))
		.all();
}

export async function listRecentDiscussionThreads(db: ORM, viewer: ThreadViewer, limit = 30) {
	const { results = [] } = await db.$client
		.prepare(
			`WITH listed_threads AS (
				SELECT *
				FROM threads
				WHERE category_id <> ?
					AND deleted_at IS NULL
					AND ${threadAccessSql('threads')}
				ORDER BY last_post_at DESC, created_at DESC
				LIMIT ?
			)
			SELECT
				t.id AS threadId,
				t.category_id AS threadCategoryId,
				t.author_user_id AS threadAuthorUserId,
				t.session_id AS threadSessionId,
				t.session_thread_role AS threadSessionThreadRole,
				t.audience_group_id AS threadAudienceGroupId,
				t.title AS threadTitle,
				t.slug AS threadSlug,
				t.body_source AS threadBodySource,
				t.body_html AS threadBodyHtml,
				t.contains_spoilers AS threadContainsSpoilers,
				t.visibility AS threadVisibility,
				t.is_locked AS threadIsLocked,
				t.is_pinned AS threadIsPinned,
				t.reply_count AS threadReplyCount,
				t.last_post_at AS threadLastPostAt,
				t.deleted_at AS threadDeletedAt,
				t.created_at AS threadCreatedAt,
				t.updated_at AS threadUpdatedAt,
				author.id AS authorId,
				author.display_name AS authorDisplayName,
				author.avatar_url AS authorAvatarUrl,
				COALESCE((
					SELECT json_group_array(json_object(
						'id', participant.id,
						'displayName', participant.displayName,
						'avatarUrl', participant.avatarUrl,
						'lastActivityAt', participant.lastActivityAt
					))
					FROM (
						SELECT u.id, u.display_name AS displayName, u.avatar_url AS avatarUrl, max(p.created_at) AS lastActivityAt
						FROM posts p
						INNER JOIN users u ON u.id = p.author_user_id
						WHERE p.thread_id = t.id AND p.deleted_at IS NULL
						GROUP BY u.id, u.display_name, u.avatar_url
						ORDER BY lastActivityAt DESC
					) participant
				), '[]') AS participantsJson
			FROM listed_threads t
			INNER JOIN users author ON author.id = t.author_user_id
			ORDER BY t.last_post_at DESC, t.created_at DESC`
		)
		.bind(SESSION_DISCUSSIONS_CATEGORY_ID, ...threadAccessBindings(viewer), limit)
		.all<ThreadListSqlRow>();

	return withThreadReadContext(db, viewer.userId, results.map(mapThreadListSqlRow));
}

export function buildSessionDiscussionBody(args: { title: string; themeTitle?: string | null }) {
	const lines = [`Discussion for **${args.title}**.`];

	if (args.themeTitle?.trim()) {
		lines.push('', `Theme: **${args.themeTitle.trim()}**`);
	}

	lines.push(
		'',
		'Use this thread for questions, reactions, reading notes, recommendations, and follow-up discussion related to this session.'
	);

	return lines.join('\n');
}

export async function createPrimarySessionThread(args: {
	db: ORM;
	session: { id: string; title: string; themeTitle?: string | null };
	authorUserId: string;
}) {
	const now = new Date().toISOString();
	const threadId = newId();
	const bodySource = buildSessionDiscussionBody(args.session);
	const slug = await createUniqueThreadSlug(args.db, args.session.title);

	await args.db.insert(threads).values({
		id: threadId,
		categoryId: SESSION_DISCUSSIONS_CATEGORY_ID,
		authorUserId: args.authorUserId,
		sessionId: args.session.id,
		sessionThreadRole: 'primary',
		title: args.session.title,
		slug,
		bodySource,
		bodyHtml: renderMarkdown(bodySource),
		visibility: 'members',
		lastPostAt: now
	});

	return { id: threadId, slug, bodySource };
}

export async function createUniqueThreadSlug(db: ORM, title: string) {
	const baseSlug = slugify(title);
	let slug = baseSlug;
	let suffix = 2;

	while (true) {
		const existing = await db
			.select({ id: threads.id })
			.from(threads)
			.where(eq(threads.slug, slug))
			.get();
		if (!existing) return slug;
		slug = `${baseSlug}-${suffix}`;
		suffix += 1;
	}
}

export async function getCategoryById(db: ORM, categoryId: string) {
	return db.select().from(categories).where(eq(categories.id, categoryId)).get();
}

export function isAnnouncementsCategory(categoryId: string) {
	return categoryId === ANNOUNCEMENTS_CATEGORY_ID;
}

export function isSessionDiscussionsCategory(categoryId: string) {
	return categoryId === SESSION_DISCUSSIONS_CATEGORY_ID;
}

export async function getPrimaryThreadForSession(db: ORM, sessionId: string) {
	return db
		.select()
		.from(threads)
		.where(
			and(
				eq(threads.sessionId, sessionId),
				eq(threads.sessionThreadRole, 'primary'),
				eq(threads.categoryId, SESSION_DISCUSSIONS_CATEGORY_ID),
				isNull(threads.deletedAt)
			)
		)
		.get();
}

export async function subscribeActiveMembersToSessionThread(db: ORM, threadId: string) {
	await db.run(sql`
		INSERT OR IGNORE INTO subscriptions (id, user_id, thread_id, mode)
		SELECT
			'sub_session_' || u.id || '_' || ${threadId},
			u.id,
			${threadId},
			np.default_sub_mode
		FROM users u
		INNER JOIN notification_preferences np ON np.user_id = u.id
		WHERE u.status = 'active'
			AND u.last_login_at IS NOT NULL
			AND np.auto_subscribe_session_threads = 1
	`);
}

export async function subscribeUserToPrimaryCurrentSessionThreads(db: ORM, userId: string) {
	const prefs = await db
		.select({
			defaultSubMode: notificationPreferences.defaultSubMode,
			autoSubscribeSessionThreads: notificationPreferences.autoSubscribeSessionThreads
		})
		.from(notificationPreferences)
		.where(eq(notificationPreferences.userId, userId))
		.get();

	if (!prefs?.autoSubscribeSessionThreads) return;

	await db.run(sql`
		INSERT OR IGNORE INTO subscriptions (id, user_id, thread_id, mode)
		SELECT
			'sub_session_' || ${userId} || '_' || t.id,
			${userId},
			t.id,
			${prefs.defaultSubMode}
		FROM threads t
		INNER JOIN sessions se ON se.id = t.session_id
		WHERE t.session_thread_role = 'primary'
			AND t.deleted_at IS NULL
			AND (
				t.audience_group_id IS NULL
				OR EXISTS (
					SELECT 1 FROM group_memberships gm
					WHERE gm.group_id = t.audience_group_id AND gm.user_id = ${userId}
				)
			)
			AND se.status = 'current'
	`);
}

export type ThreadParticipant = {
	id: string;
	displayName: string;
	avatarUrl: string | null;
	lastActivityAt: string;
};

export type ThreadListSqlRow = {
	threadId: string;
	threadCategoryId: string;
	threadAuthorUserId: string;
	threadSessionId: string | null;
	threadSessionThreadRole: string | null;
	threadAudienceGroupId?: string | null;
	threadTitle: string;
	threadSlug: string;
	threadBodySource: string;
	threadBodyHtml: string;
	threadContainsSpoilers: number;
	threadVisibility: string;
	threadIsLocked: number;
	threadIsPinned: number;
	threadReplyCount: number;
	threadLastPostAt: string | null;
	threadDeletedAt: string | null;
	threadCreatedAt: string;
	threadUpdatedAt: string;
	authorId: string;
	authorDisplayName: string;
	authorAvatarUrl: string | null;
	participantsJson: string | null;
};

export function mapThreadListSqlRow(row: ThreadListSqlRow) {
	return {
		thread: {
			id: row.threadId,
			categoryId: row.threadCategoryId,
			authorUserId: row.threadAuthorUserId,
			sessionId: row.threadSessionId,
			sessionThreadRole: row.threadSessionThreadRole,
			audienceGroupId: row.threadAudienceGroupId ?? null,
			title: row.threadTitle,
			slug: row.threadSlug,
			bodySource: row.threadBodySource,
			bodyHtml: row.threadBodyHtml,
			containsSpoilers: Boolean(row.threadContainsSpoilers),
			visibility: row.threadVisibility,
			isLocked: Boolean(row.threadIsLocked),
			isPinned: Boolean(row.threadIsPinned),
			replyCount: row.threadReplyCount,
			lastPostAt: row.threadLastPostAt,
			deletedAt: row.threadDeletedAt,
			createdAt: row.threadCreatedAt,
			updatedAt: row.threadUpdatedAt
		},
		author: {
			id: row.authorId,
			displayName: row.authorDisplayName,
			avatarUrl: row.authorAvatarUrl
		},
		participants: parseThreadParticipants(row.participantsJson)
	};
}

export function parseThreadParticipants(value: string | null | undefined): ThreadParticipant[] {
	if (!value) return [];

	try {
		const parsed = JSON.parse(value) as ThreadParticipant[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}
