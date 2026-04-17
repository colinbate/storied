import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { books, subjectSources } from '$lib/server/db/schema';
import { eq, desc, isNull, and } from 'drizzle-orm';
import { requirePermission } from '$lib/server/auth';
import { newId } from '$lib/server/ids';
import { slugify } from '$lib/server/slugify';
import { detectFirstSubjectLinkOfKind, ensureSubjectSource } from '$lib/server/subject-sources';

export const load: PageServerLoad = async (event) => {
	requirePermission(event.locals, 'book:edit');
	const allBooks = await event.locals.db.select().from(books).orderBy(desc(books.createdAt)).all();

	// Unresolved sources whose subject kind is (or will be) a book
	const unresolvedSources = await event.locals.db
		.select()
		.from(subjectSources)
		.where(
			and(
				isNull(subjectSources.subjectId),
				// Only book-producing source types
				eq(subjectSources.sourceType, 'goodreads')
			)
		)
		.orderBy(desc(subjectSources.createdAt))
		.all();

	return { books: allBooks, unresolvedSources };
};

export const actions: Actions = {
	retrySource: async ({ request, locals, platform }) => {
		requirePermission(locals, 'book:edit');

		const data = await request.formData();
		const sourceId = data.get('sourceId')?.toString();
		if (!sourceId) return fail(400, { error: 'Missing source ID' });

		const source = await locals.db
			.select()
			.from(subjectSources)
			.where(eq(subjectSources.id, sourceId))
			.get();
		if (!source) return fail(404, { error: 'Source not found' });

		await locals.db
			.update(subjectSources)
			.set({ fetchStatus: 'pending', updatedAt: new Date().toISOString() })
			.where(eq(subjectSources.id, sourceId));

		if (platform?.env.SUBJECT_QUEUE) {
			await platform.env.SUBJECT_QUEUE.send({
				subjectSourceId: source.id,
				sourceType: source.sourceType,
				sourceUrl: source.sourceUrl,
				sourceKey: source.sourceKey
			});
		}

		return { retried: true };
	},

	ignoreSource: async ({ request, locals }) => {
		requirePermission(locals, 'book:edit');

		const data = await request.formData();
		const sourceId = data.get('sourceId')?.toString();
		if (!sourceId) return fail(400, { error: 'Missing source ID' });

		await locals.db
			.update(subjectSources)
			.set({ fetchStatus: 'ignored', updatedAt: new Date().toISOString() })
			.where(eq(subjectSources.id, sourceId));

		return { ignored: true };
	},

	createManual: async ({ request, locals }) => {
		requirePermission(locals, 'book:edit');

		const data = await request.formData();
		const title = data.get('title')?.toString()?.trim();
		if (!title || title.length < 2) {
			return fail(400, { error: 'Title must be at least 2 characters.' });
		}

		const customSlug = data.get('slug')?.toString()?.trim() || '';
		const slug = customSlug || slugify(title);

		// Uniqueness check
		const existing = await locals.db
			.select({ id: books.id })
			.from(books)
			.where(eq(books.slug, slug))
			.get();
		if (existing) {
			return fail(400, { error: `A book with slug "${slug}" already exists.` });
		}

		const subtitle = data.get('subtitle')?.toString()?.trim() || null;
		const authorText = data.get('authorText')?.toString()?.trim() || null;
		const coverUrl = data.get('coverUrl')?.toString()?.trim() || null;
		const isbn13 = data.get('isbn13')?.toString()?.trim() || null;
		const openLibraryId = data.get('openLibraryId')?.toString()?.trim() || null;
		const googleBooksId = data.get('googleBooksId')?.toString()?.trim() || null;
		const amazonAsin = data.get('amazonAsin')?.toString()?.trim() || null;
		const goodreadsUrl = data.get('goodreadsUrl')?.toString()?.trim() || null;
		const firstPublishYearStr = data.get('firstPublishYear')?.toString()?.trim() || '';
		const firstPublishYear = firstPublishYearStr ? Number(firstPublishYearStr) : null;
		const description = data.get('description')?.toString()?.trim() || null;

		const id = newId();
		await locals.db.insert(books).values({
			id,
			slug,
			title,
			subtitle,
			authorText,
			coverUrl,
			isbn13,
			openLibraryId,
			googleBooksId,
			amazonAsin,
			goodreadsUrl,
			firstPublishYear: firstPublishYear && Number.isFinite(firstPublishYear) ? firstPublishYear : null,
			description
		});

		throw redirect(303, `/admin/books/${slug}`);
	},

	createFromUrl: async ({ request, locals, platform }) => {
		requirePermission(locals, 'book:edit');

		const data = await request.formData();
		const url = data.get('url')?.toString()?.trim() || '';
		if (!url) {
			return fail(400, { error: 'Please provide a Goodreads book URL.' });
		}

		const link = detectFirstSubjectLinkOfKind(url, 'book');
		if (!link) {
			return fail(400, { error: 'Only Goodreads book URLs are supported right now.' });
		}

		await ensureSubjectSource(locals.db, link, platform?.env);

		return { queued: true };
	}
};
