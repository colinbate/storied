import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import {
	categories,
	threads,
	subscriptions,
	subjectSources,
	threadSubjects,
	type SubjectType
} from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { newId } from '$lib/server/ids';
import { renderMarkdown } from '$lib/server/markdown';
import { detectSubjectLinks } from '$lib/server/book-links';
import { publishWorkerMessage } from '$lib/server/worker-queue';
import { getOrCreateNotificationPreferences } from '$lib/server/notification-preferences';
import type { SubjectSourceType } from '$shared/worker-messages';
import {
	ANNOUNCEMENTS_CATEGORY_ID,
	SESSION_DISCUSSIONS_CATEGORY_ID,
	createUniqueThreadSlug,
	isAnnouncementsCategory,
	isSessionDiscussionsCategory
} from '$lib/server/discussions';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const allCategories = await locals.db
		.select()
		.from(categories)
		.orderBy(asc(categories.sortOrder))
		.all();

	const canPostAnnouncements = locals.permissions.has('moderate');
	const availableCategories = allCategories.filter((category) => {
		if (category.id === SESSION_DISCUSSIONS_CATEGORY_ID) return false;
		if (category.id === ANNOUNCEMENTS_CATEGORY_ID && !canPostAnnouncements) return false;
		return true;
	});

	const preselectedCategory = url.searchParams.get('category') ?? '';

	return {
		categories: availableCategories,
		preselectedCategory,
		announcementCategoryId: ANNOUNCEMENTS_CATEGORY_ID,
		canPostAnnouncements
	};
};

export const actions: Actions = {
	default: async ({ request, locals, platform, url }) => {
		if (!locals.user) {
			throw redirect(302, '/auth/login');
		}

		const data = await request.formData();
		const title = data.get('title')?.toString()?.trim();
		const bodySource = data.get('body')?.toString()?.trim();
		const categoryId = data.get('categoryId')?.toString();
		const notifyAllMembersByEmail = data.get('notifyAllMembersByEmail') === 'on';

		if (!title || title.length < 3 || title.length > 200) {
			return fail(400, {
				error: 'Title must be between 3 and 200 characters.',
				title,
				body: bodySource,
				categoryId
			});
		}
		if (!bodySource || bodySource.length < 1) {
			return fail(400, {
				error: 'Thread body cannot be empty.',
				title,
				body: bodySource,
				categoryId
			});
		}
		if (!categoryId) {
			return fail(400, {
				error: 'Please select a category.',
				title,
				body: bodySource,
				categoryId
			});
		}

		// Verify category exists
		const category = await locals.db
			.select()
			.from(categories)
			.where(eq(categories.id, categoryId))
			.get();

		if (!category) {
			return fail(400, {
				error: 'Invalid category.',
				title,
				body: bodySource,
				categoryId
			});
		}

		if (isSessionDiscussionsCategory(category.id)) {
			return fail(400, {
				error: 'Session discussion threads are created automatically from sessions.',
				title,
				body: bodySource,
				categoryId
			});
		}

		if (isAnnouncementsCategory(category.id) && !locals.permissions.has('moderate')) {
			return fail(403, {
				error: 'Only moderators and admins can start announcement threads.',
				title,
				body: bodySource,
				categoryId
			});
		}

		const bodyHtml = renderMarkdown(bodySource);
		const slug = await createUniqueThreadSlug(locals.db, title);
		const threadId = newId();
		const now = new Date().toISOString();

		await locals.db.insert(threads).values({
			id: threadId,
			categoryId,
			authorUserId: locals.user.id,
			title,
			slug,
			bodySource,
			bodyHtml,
			lastPostAt: now
		});

		// Auto-subscribe the thread creator, honoring their preferences.
		const prefs = await getOrCreateNotificationPreferences(locals.db, locals.user.id);
		if (prefs.autoSubscribeOwn) {
			await locals.db.insert(subscriptions).values({
				id: newId(),
				userId: locals.user.id,
				threadId,
				mode: prefs.defaultSubMode
			});
		}

		// Detect and process subject links (books and series)
		const detectedLinks = detectSubjectLinks(bodySource);
		for (let i = 0; i < detectedLinks.length; i++) {
			const link = detectedLinks[i];

			// Check if we already have this source
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
						threadId
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
					threadId
				});
			}

			// Link thread to subject if already resolved
			if (resolvedSubjectType && resolvedSubjectId) {
				await locals.db
					.insert(threadSubjects)
					.values({
						id: newId(),
						threadId,
						subjectType: resolvedSubjectType as SubjectType,
						subjectId: resolvedSubjectId,
						displayOrder: i,
						context: 'linked',
						addedBy: locals.user.id
					})
					.onConflictDoNothing();
			}
		}

		await publishWorkerMessage(platform?.env.WORKER_QUEUE, 'notifications.new-thread', {
			threadId,
			threadAuthorUserId: locals.user.id,
			baseUrl: url.origin,
			broadcastToAllMembers: notifyAllMembersByEmail && isAnnouncementsCategory(category.id)
		});

		throw redirect(302, `/thread/${slug}`);
	}
};
