import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { categories, threads, subscriptions, bookSources, postBooks } from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { newId } from '$lib/server/ids';
import { slugify } from '$lib/server/slugify';
import { renderMarkdown } from '$lib/server/markdown';
import { detectBookLinks } from '$lib/server/book-links';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _eq: any = eq;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _and: any = and;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _asc: any = asc;

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const allCategories = await locals.db
		.select()
		.from(categories)
		.orderBy(_asc(categories.sortOrder))
		.all();

	const preselectedCategory = url.searchParams.get('category') ?? '';

	return { categories: allCategories, preselectedCategory };
};

export const actions: Actions = {
	default: async ({ request, locals, platform }) => {
		if (!locals.user) {
			throw redirect(302, '/auth/login');
		}

		const data = await request.formData();
		const title = data.get('title')?.toString()?.trim();
		const bodySource = data.get('body')?.toString()?.trim();
		const categoryId = data.get('categoryId')?.toString();

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
			.where(_eq(categories.id, categoryId))
			.get();

		if (!category) {
			return fail(400, {
				error: 'Invalid category.',
				title,
				body: bodySource,
				categoryId
			});
		}

		const bodyHtml = renderMarkdown(bodySource);
		const slug = slugify(title);
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

		// Auto-subscribe the thread creator
		await locals.db.insert(subscriptions).values({
			id: newId(),
			userId: locals.user.id,
			threadId,
			mode: 'immediate'
		});

		// Detect and process book links
		const detectedLinks = detectBookLinks(bodySource);
		for (let i = 0; i < detectedLinks.length; i++) {
			const link = detectedLinks[i];

			// Check if we already have this source
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
				if (!existingSource.canonicalBookId && platform?.env.BOOK_QUEUE) {
					await platform.env.BOOK_QUEUE.send({
						bookSourceId: existingSource.id,
						sourceType: link.sourceType,
						sourceUrl: link.url,
						sourceKey: link.sourceKey,
						threadId
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
						threadId
					});
				}
			}

			// Link to thread if book is already resolved
			if (bookId) {
				await locals.db.insert(postBooks).values({
					id: newId(),
					threadId,
					bookId,
					bookSourceId: sourceId,
					displayOrder: i,
					context: 'linked'
				});
			}
		}

		throw redirect(302, `/thread/${slug}`);
	}
};
