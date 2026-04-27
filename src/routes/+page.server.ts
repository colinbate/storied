import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { categories, sessions, threads } from '$lib/server/db/schema';
import { eq, isNull, desc, asc, and, count } from 'drizzle-orm';
import {
	mapThreadListSqlRow,
	type ThreadListSqlRow,
	SESSION_DISCUSSIONS_CATEGORY_ID
} from '$lib/server/discussions';
import { getCurrentUserSessionRsvp, isFutureSession, setMemberRsvp } from '$lib/server/rsvp';

export const load: PageServerLoad = async ({ locals }) => {
	// Load categories
	const allCategories = await locals.db
		.select({
			id: categories.id,
			name: categories.name,
			slug: categories.slug,
			description: categories.description,
			size: count(threads.id).as('size')
		})
		.from(categories)
		.leftJoin(threads, and(eq(threads.categoryId, categories.id), isNull(threads.deletedAt)))
		.groupBy(categories.id, categories.name, categories.description, categories.slug)
		.orderBy(asc(categories.sortOrder), asc(categories.name))
		.where(eq(categories.isPrivate, false))
		.all();

	const { results: recentThreadRows = [] } = await locals.db.$client
		.prepare(
			`WITH listed_threads AS (
				SELECT *
				FROM threads
				WHERE deleted_at IS NULL
				ORDER BY last_post_at DESC, created_at DESC
				LIMIT 20
			)
			SELECT
				t.id AS threadId,
				t.category_id AS threadCategoryId,
				t.author_user_id AS threadAuthorUserId,
				t.session_id AS threadSessionId,
				t.session_thread_role AS threadSessionThreadRole,
				t.title AS threadTitle,
				t.slug AS threadSlug,
				t.body_source AS threadBodySource,
				t.body_html AS threadBodyHtml,
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
		.all<ThreadListSqlRow>();
	const recentThreads = recentThreadRows.map(mapThreadListSqlRow);

	const currentSessions = await locals.db
		.select()
		.from(sessions)
		.orderBy(asc(sessions.startsAt), desc(sessions.createdAt))
		.all();

	const featuredSession =
		currentSessions.find((session) => session.status === 'current') ??
		currentSessions.find((session) => session.status === 'draft') ??
		null;

	const { results: featuredDiscussionRows = [] } = featuredSession
		? await locals.db.$client
				.prepare(
					`WITH listed_threads AS (
						SELECT *
						FROM threads
						WHERE session_id = ?
							AND session_thread_role = 'primary'
							AND category_id = ?
							AND deleted_at IS NULL
						LIMIT 1
					)
					SELECT
						t.id AS threadId,
						t.category_id AS threadCategoryId,
						t.author_user_id AS threadAuthorUserId,
						t.session_id AS threadSessionId,
						t.session_thread_role AS threadSessionThreadRole,
						t.title AS threadTitle,
						t.slug AS threadSlug,
						t.body_source AS threadBodySource,
						t.body_html AS threadBodyHtml,
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
					INNER JOIN users author ON author.id = t.author_user_id`
				)
				.bind(featuredSession.id, SESSION_DISCUSSIONS_CATEGORY_ID)
				.all<ThreadListSqlRow>()
		: { results: [] };
	const [featuredDiscussion = null] = featuredDiscussionRows.map(mapThreadListSqlRow);

	return {
		categories: allCategories,
		recentThreads,
		currentSession: featuredSession,
		canRsvpToCurrentSession: featuredSession ? isFutureSession(featuredSession) : false,
		currentSessionRsvp:
			featuredSession && locals.user
				? await getCurrentUserSessionRsvp(locals.db, featuredSession.id, locals.user.id)
				: null,
		featuredDiscussion,
		pastSessions: currentSessions
			.filter((session) => session.status === 'past')
			.reverse()
			.slice(0, 2)
	};
};

export const actions: Actions = {
	setSessionRsvp: async ({ locals, request, platform }) => {
		if (!locals.user) {
			throw redirect(302, '/auth/login');
		}

		const data = await request.formData();
		const sessionSlug = data.get('sessionSlug')?.toString();
		const status = data.get('status')?.toString();
		if (!sessionSlug) {
			return fail(400, { error: 'Missing session.' });
		}
		if (status !== 'registered' && status !== 'declined') {
			return fail(400, { error: 'Invalid RSVP response.' });
		}

		const session = await locals.db
			.select()
			.from(sessions)
			.where(eq(sessions.slug, sessionSlug))
			.get();
		if (!session) throw error(404, 'Session not found');

		return setMemberRsvp({
			db: locals.db,
			platform,
			user: locals.user,
			session,
			status
		});
	}
};
