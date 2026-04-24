import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { categories, subscriptions, threads, users } from '$lib/server/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { newId } from '$lib/server/ids';
import {
	ANNOUNCEMENTS_CATEGORY_ID,
	SESSION_DISCUSSIONS_CATEGORY_ID,
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

	const categoryThreads = await locals.db
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
		.where(and(eq(threads.categoryId, category.id), isNull(threads.deletedAt)))
		.orderBy(desc(threads.isPinned), desc(threads.lastPostAt), desc(threads.createdAt))
		.all();

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
