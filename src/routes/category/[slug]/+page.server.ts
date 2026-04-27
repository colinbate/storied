import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { categories, subscriptions } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { newId } from '$lib/server/ids';
import {
	ANNOUNCEMENTS_CATEGORY_ID,
	mapThreadListSqlRow,
	SESSION_DISCUSSIONS_CATEGORY_ID,
	type ThreadListSqlRow,
	isAnnouncementsCategory,
	isSessionDiscussionsCategory
} from '$lib/server/discussions';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const category = await locals.db
		.select()
		.from(categories)
		.where(eq(categories.slug, params.slug))
		.get();

	if (!category) {
		throw error(404, 'Category not found');
	}

	const { results: categoryThreadRows = [] } = await locals.db.$client
		.prepare(
			`WITH listed_threads AS (
				SELECT *
				FROM threads
				WHERE category_id = ? AND deleted_at IS NULL
				ORDER BY is_pinned DESC, last_post_at DESC, created_at DESC
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
			ORDER BY t.is_pinned DESC, t.last_post_at DESC, t.created_at DESC`
		)
		.bind(category.id)
		.all<ThreadListSqlRow>();
	const categoryThreads = categoryThreadRows.map(mapThreadListSqlRow);

	const subscription = await locals.db
		.select()
		.from(subscriptions)
		.where(and(eq(subscriptions.userId, locals.user.id), eq(subscriptions.categoryId, category.id)))
		.get();

	const canCreateThread =
		!isSessionDiscussionsCategory(category.id) &&
		(!isAnnouncementsCategory(category.id) || locals.permissions.has('moderate'));

	return {
		category,
		threads: categoryThreads,
		canCreateThread,
		subscriptionMode: (subscription?.mode ?? 'none') as
			| 'immediate'
			| 'daily_digest'
			| 'mute'
			| 'none',
		announcementCategoryId: ANNOUNCEMENTS_CATEGORY_ID,
		sessionDiscussionsCategoryId: SESSION_DISCUSSIONS_CATEGORY_ID
	};
};

export const actions: Actions = {
	setSubscriptionMode: async ({ locals, params, request }) => {
		if (!locals.user) {
			throw redirect(302, '/auth/login');
		}

		const data = await request.formData();
		const mode = data.get('mode')?.toString();
		if (mode !== 'immediate' && mode !== 'daily_digest' && mode !== 'mute' && mode !== 'none') {
			return fail(400, { error: 'Invalid subscription mode.' });
		}

		const category = await locals.db
			.select()
			.from(categories)
			.where(eq(categories.slug, params.slug))
			.get();

		if (!category) {
			throw error(404, 'Category not found');
		}

		if (mode === 'none') {
			await locals.db
				.delete(subscriptions)
				.where(
					and(eq(subscriptions.userId, locals.user.id), eq(subscriptions.categoryId, category.id))
				);
			return { subscriptionMode: 'none' as const };
		}

		const now = new Date().toISOString();
		await locals.db
			.insert(subscriptions)
			.values({
				id: newId(),
				userId: locals.user.id,
				categoryId: category.id,
				mode
			})
			.onConflictDoUpdate({
				target: [subscriptions.userId, subscriptions.categoryId],
				set: { mode, updatedAt: now }
			});

		return { subscriptionMode: mode };
	}
};
