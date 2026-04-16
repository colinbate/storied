import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { categories, threads, subscriptions } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { newId } from '$lib/server/ids';
import { slugify } from '$lib/server/slugify';
import { renderMarkdown } from '$lib/server/markdown';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _eq: any = eq;
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
	default: async ({ request, locals }) => {
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

		throw redirect(302, `/thread/${slug}`);
	}
};
