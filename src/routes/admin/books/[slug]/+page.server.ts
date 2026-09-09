import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	books,
	bookAccessOptions,
	series,
	seriesBooks,
	genres,
	genreLinks,
	sessions,
	sessionSubjects,
	themeBooks,
	themes,
	subjectSources,
	type BookAccessFormat,
	type BookAccessProviderType,
	type SessionSubjectStatus
} from '$lib/server/db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { requirePermission } from '$lib/server/auth';
import { detectFirstSubjectLinkOfKind, ensureSubjectSource } from '$lib/server/subject-sources';
import { publishWorkerMessage } from '$lib/server/worker-queue';
import type { SubjectSourceType } from '$shared/worker-messages';
import {
	classificationIdsFromForm,
	loadClassificationEditor,
	replaceSubjectClassifications
} from '$lib/server/classifications';
import { newId } from '$lib/server/ids';

const SUBJECT = 'book' as const;
const sessionSubjectStatuses = new Set(['starter', 'featured', 'discussed', 'mentioned_off_theme']);
const accessProviderTypes = new Set(['library', 'retailer', 'subscription', 'other']);
const accessFormats = new Set(['print', 'ebook', 'audiobook', 'other']);

function getSessionSubjectStatus(data: FormData): SessionSubjectStatus {
	const status = data.get('status')?.toString();
	return sessionSubjectStatuses.has(status ?? '') ? (status as SessionSubjectStatus) : 'starter';
}

function optionalPositiveInteger(data: FormData, name: string) {
	const raw = data.get(name)?.toString().trim() ?? '';
	if (!raw) return null;
	const value = Number(raw);
	return Number.isInteger(value) && value > 0 ? value : null;
}

function accessValues(data: FormData) {
	const providerName = data.get('providerName')?.toString().trim() ?? '';
	const providerType = data.get('providerType')?.toString() ?? '';
	const format = data.get('format')?.toString() ?? '';
	const url = data.get('url')?.toString().trim() || null;
	const note = data.get('note')?.toString().trim() || null;
	if (!providerName) return { error: 'Enter a provider name.' } as const;
	if (!accessProviderTypes.has(providerType))
		return { error: 'Choose a valid provider type.' } as const;
	if (!accessFormats.has(format)) return { error: 'Choose a valid format.' } as const;
	if (url) {
		try {
			const parsed = new URL(url);
			if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid protocol');
		} catch {
			return { error: 'Enter a valid web address.' } as const;
		}
	}
	return {
		providerName,
		providerType: providerType as BookAccessProviderType,
		format: format as BookAccessFormat,
		url,
		note
	};
}

export const load: PageServerLoad = async ({ params, locals }) => {
	requirePermission(locals, 'book:edit');

	const book = await locals.db.select().from(books).where(eq(books.slug, params.slug)).get();
	if (!book) throw error(404, 'Book not found');
	const classificationEditor = await loadClassificationEditor(locals.db, SUBJECT, book.id);

	// Genres linked to this book
	const genreRows = await locals.db
		.select({
			genreId: genreLinks.genreId,
			confidence: genreLinks.confidence,
			genre: genres
		})
		.from(genreLinks)
		.innerJoin(genres, eq(genreLinks.genreId, genres.id))
		.where(and(eq(genreLinks.subjectType, SUBJECT), eq(genreLinks.subjectId, book.id)))
		.all();

	const allGenres = await locals.db.select().from(genres).orderBy(asc(genres.name)).all();

	// Series containing this book
	const seriesRows = await locals.db
		.select({
			link: seriesBooks,
			series
		})
		.from(seriesBooks)
		.innerJoin(series, eq(seriesBooks.seriesId, series.id))
		.where(eq(seriesBooks.bookId, book.id))
		.all();

	const allSeries = await locals.db
		.select({
			id: series.id,
			title: series.title,
			authorText: series.authorText,
			slug: series.slug,
			deletedAt: series.deletedAt
		})
		.from(series)
		.orderBy(asc(series.title))
		.all();

	// Sessions linked to this book
	const sessionRows = await locals.db
		.select({
			link: sessionSubjects,
			session: sessions
		})
		.from(sessionSubjects)
		.innerJoin(sessions, eq(sessionSubjects.sessionId, sessions.id))
		.where(and(eq(sessionSubjects.subjectType, SUBJECT), eq(sessionSubjects.subjectId, book.id)))
		.orderBy(desc(sessions.createdAt))
		.all();

	const allSessions = await locals.db
		.select({ id: sessions.id, title: sessions.title, theme: sessions.theme, slug: sessions.slug })
		.from(sessions)
		.orderBy(desc(sessions.startsAt), desc(sessions.createdAt))
		.all();

	const accessOptions = await locals.db
		.select()
		.from(bookAccessOptions)
		.where(eq(bookAccessOptions.bookId, book.id))
		.orderBy(asc(bookAccessOptions.providerName), asc(bookAccessOptions.format))
		.all();

	const themeLinks = await locals.db
		.select({ link: themeBooks, theme: themes })
		.from(themeBooks)
		.innerJoin(themes, eq(themeBooks.themeId, themes.id))
		.where(eq(themeBooks.bookId, book.id))
		.orderBy(asc(themes.name))
		.all();

	// Subject sources tied to this book
	const sources = await locals.db
		.select()
		.from(subjectSources)
		.where(and(eq(subjectSources.subjectType, SUBJECT), eq(subjectSources.subjectId, book.id)))
		.orderBy(desc(subjectSources.updatedAt))
		.all();

	return {
		book,
		...classificationEditor,
		genreLinks: genreRows,
		allGenres,
		seriesMemberships: seriesRows,
		allSeries,
		sessionLinks: sessionRows,
		allSessions,
		accessOptions,
		themeLinks,
		sources
	};
};

export const actions: Actions = {
	updateMetadata: async ({ request, params, locals }) => {
		requirePermission(locals, 'book:edit');

		const book = await locals.db.select().from(books).where(eq(books.slug, params.slug)).get();
		if (!book) return fail(404, { error: 'Book not found' });

		const data = await request.formData();
		const title = data.get('title')?.toString()?.trim();
		if (!title || title.length < 2) {
			return fail(400, { error: 'Title must be at least 2 characters.' });
		}

		const firstPublishYearStr = data.get('firstPublishYear')?.toString()?.trim() || '';
		const firstPublishYear = firstPublishYearStr ? Number(firstPublishYearStr) : null;
		const pageCountRaw = data.get('pageCount')?.toString().trim() ?? '';
		const audiobookMinutesRaw = data.get('audiobookMinutes')?.toString().trim() ?? '';
		const pageCount = optionalPositiveInteger(data, 'pageCount');
		const audiobookMinutes = optionalPositiveInteger(data, 'audiobookMinutes');
		if (pageCountRaw && pageCount === null) {
			return fail(400, { error: 'Page count must be a positive whole number.' });
		}
		if (audiobookMinutesRaw && audiobookMinutes === null) {
			return fail(400, { error: 'Audiobook length must be a positive whole number.' });
		}

		await locals.db
			.update(books)
			.set({
				title,
				subtitle: data.get('subtitle')?.toString()?.trim() || null,
				authorText: data.get('authorText')?.toString()?.trim() || null,
				coverUrl: data.get('coverUrl')?.toString()?.trim() || null,
				isbn13: data.get('isbn13')?.toString()?.trim() || null,
				openLibraryId: data.get('openLibraryId')?.toString()?.trim() || null,
				googleBooksId: data.get('googleBooksId')?.toString()?.trim() || null,
				amazonAsin: data.get('amazonAsin')?.toString()?.trim() || null,
				goodreadsUrl: data.get('goodreadsUrl')?.toString()?.trim() || null,
				hardcoverUrl: data.get('hardcoverUrl')?.toString()?.trim() || null,
				firstPublishYear:
					firstPublishYear && Number.isFinite(firstPublishYear) ? firstPublishYear : null,
				editionLabel: data.get('editionLabel')?.toString()?.trim() || null,
				language: data.get('language')?.toString()?.trim() || null,
				pageCount,
				audiobookMinutes,
				description: data.get('description')?.toString()?.trim() || null,
				updatedAt: new Date().toISOString()
			})
			.where(eq(books.id, book.id));

		return { updated: true };
	},

	saveClassifications: async ({ request, params, locals }) => {
		requirePermission(locals, 'book:edit');
		const book = await locals.db.select().from(books).where(eq(books.slug, params.slug)).get();
		if (!book) return fail(404, { error: 'Book not found' });

		const data = await request.formData();
		await replaceSubjectClassifications(
			locals.db,
			SUBJECT,
			book.id,
			classificationIdsFromForm(data)
		);
		return { classificationsUpdated: true };
	},

	saveGenres: async ({ request, params, locals }) => {
		requirePermission(locals, 'book:edit');

		const book = await locals.db.select().from(books).where(eq(books.slug, params.slug)).get();
		if (!book) return fail(404, { error: 'Book not found' });

		const data = await request.formData();
		const raw = data.get('genreIds')?.toString() ?? '';
		const ids = raw
			.split(',')
			.map((s) => parseInt(s.trim(), 10))
			.filter((n) => Number.isFinite(n) && n > 0);

		// Remove all existing links for this book, re-insert the chosen set.
		await locals.db
			.delete(genreLinks)
			.where(and(eq(genreLinks.subjectType, SUBJECT), eq(genreLinks.subjectId, book.id)));

		for (const genreId of ids) {
			await locals.db
				.insert(genreLinks)
				.values({
					genreId,
					subjectType: SUBJECT,
					subjectId: book.id,
					confidence: 'manual'
				})
				.onConflictDoNothing();
		}

		return { genresUpdated: true };
	},

	addToSeries: async ({ request, params, locals, platform }) => {
		requirePermission(locals, 'book:edit');

		const book = await locals.db.select().from(books).where(eq(books.slug, params.slug)).get();
		if (!book) return fail(404, { error: 'Book not found' });

		const data = await request.formData();
		const mode = data.get('mode')?.toString();
		const position = data.get('position')?.toString()?.trim() || null;
		const positionSortStr = data.get('positionSort')?.toString()?.trim() || '';
		const positionSort = positionSortStr ? Number(positionSortStr) : null;

		if (mode === 'url') {
			const url = data.get('url')?.toString()?.trim() || '';
			const link = detectFirstSubjectLinkOfKind(url, 'series');
			if (!link)
				return fail(400, { error: 'Only Goodreads or Hardcover series URLs are supported.' });

			// Enqueue with a series-book side effect so the worker links this book
			// to the resolved series automatically.
			const result = await ensureSubjectSource(locals.db, link, platform?.env, {
				seriesBookLink: {
					bookId: book.id,
					position,
					positionSort: positionSort && Number.isFinite(positionSort) ? positionSort : null
				}
			});
			if (result.resolvedSubjectId) return { seriesAdded: true };
			return { queuedSeries: true };
		}

		const seriesId = data.get('seriesId')?.toString();
		if (!seriesId) return fail(400, { error: 'Select a series to add.' });

		await locals.db
			.insert(seriesBooks)
			.values({
				seriesId,
				bookId: book.id,
				position,
				positionSort: positionSort && Number.isFinite(positionSort) ? positionSort : null
			})
			.onConflictDoNothing();

		return { seriesAdded: true };
	},

	updateSeriesMembership: async ({ request, params, locals }) => {
		requirePermission(locals, 'book:edit');

		const book = await locals.db.select().from(books).where(eq(books.slug, params.slug)).get();
		if (!book) return fail(404, { error: 'Book not found' });

		const data = await request.formData();
		const seriesId = data.get('seriesId')?.toString();
		if (!seriesId) return fail(400, { error: 'Missing series ID' });

		const position = data.get('position')?.toString()?.trim() || null;
		const positionSortStr = data.get('positionSort')?.toString()?.trim() || '';
		const positionSort = positionSortStr ? Number(positionSortStr) : null;

		await locals.db
			.update(seriesBooks)
			.set({
				position,
				positionSort: positionSort && Number.isFinite(positionSort) ? positionSort : null
			})
			.where(and(eq(seriesBooks.seriesId, seriesId), eq(seriesBooks.bookId, book.id)));

		return { membershipUpdated: true };
	},

	removeFromSeries: async ({ request, params, locals }) => {
		requirePermission(locals, 'book:edit');

		const book = await locals.db.select().from(books).where(eq(books.slug, params.slug)).get();
		if (!book) return fail(404, { error: 'Book not found' });

		const data = await request.formData();
		const seriesId = data.get('seriesId')?.toString();
		if (!seriesId) return fail(400, { error: 'Missing series ID' });

		await locals.db
			.delete(seriesBooks)
			.where(and(eq(seriesBooks.seriesId, seriesId), eq(seriesBooks.bookId, book.id)));

		return { removedFromSeries: true };
	},

	addSessionLink: async ({ request, params, locals }) => {
		requirePermission(locals, 'book:edit');

		const book = await locals.db.select().from(books).where(eq(books.slug, params.slug)).get();
		if (!book) return fail(404, { error: 'Book not found' });

		const data = await request.formData();
		const sessionId = data.get('sessionId')?.toString();
		if (!sessionId) return fail(400, { error: 'Select a session.' });

		const status = getSessionSubjectStatus(data);
		const note = data.get('note')?.toString()?.trim() || null;

		await locals.db
			.insert(sessionSubjects)
			.values({
				sessionId,
				subjectType: SUBJECT,
				subjectId: book.id,
				status,
				note,
				addedByUserId: locals.user?.id ?? null
			})
			.onConflictDoNothing();

		return { sessionLinkAdded: true };
	},

	updateSessionLink: async ({ request, params, locals }) => {
		requirePermission(locals, 'book:edit');

		const book = await locals.db.select().from(books).where(eq(books.slug, params.slug)).get();
		if (!book) return fail(404, { error: 'Book not found' });

		const data = await request.formData();
		const sessionId = data.get('sessionId')?.toString();
		if (!sessionId) return fail(400, { error: 'Missing session ID' });

		const status = getSessionSubjectStatus(data);
		const note = data.get('note')?.toString()?.trim() || null;

		await locals.db
			.update(sessionSubjects)
			.set({ status, note, updatedAt: new Date().toISOString() })
			.where(
				and(
					eq(sessionSubjects.sessionId, sessionId),
					eq(sessionSubjects.subjectType, SUBJECT),
					eq(sessionSubjects.subjectId, book.id)
				)
			);

		return { sessionLinkUpdated: true };
	},

	removeSessionLink: async ({ request, params, locals }) => {
		requirePermission(locals, 'book:edit');

		const book = await locals.db.select().from(books).where(eq(books.slug, params.slug)).get();
		if (!book) return fail(404, { error: 'Book not found' });

		const data = await request.formData();
		const sessionId = data.get('sessionId')?.toString();
		if (!sessionId) return fail(400, { error: 'Missing session ID' });

		await locals.db
			.delete(sessionSubjects)
			.where(
				and(
					eq(sessionSubjects.sessionId, sessionId),
					eq(sessionSubjects.subjectType, SUBJECT),
					eq(sessionSubjects.subjectId, book.id)
				)
			);

		return { sessionLinkRemoved: true };
	},

	addAccessOption: async ({ request, params, locals }) => {
		requirePermission(locals, 'book:edit');
		const book = await locals.db
			.select({ id: books.id })
			.from(books)
			.where(eq(books.slug, params.slug))
			.get();
		if (!book) return fail(404, { error: 'Book not found' });
		const values = accessValues(await request.formData());
		if ('error' in values) return fail(400, values);

		await locals.db.insert(bookAccessOptions).values({
			id: newId(),
			bookId: book.id,
			...values,
			createdByUserId: locals.user?.id ?? null
		});
		return { accessOptionAdded: true };
	},

	updateAccessOption: async ({ request, params, locals }) => {
		requirePermission(locals, 'book:edit');
		const book = await locals.db
			.select({ id: books.id })
			.from(books)
			.where(eq(books.slug, params.slug))
			.get();
		if (!book) return fail(404, { error: 'Book not found' });
		const data = await request.formData();
		const accessOptionId = data.get('accessOptionId')?.toString();
		if (!accessOptionId) return fail(400, { error: 'Missing access option ID.' });
		const values = accessValues(data);
		if ('error' in values) return fail(400, values);

		await locals.db
			.update(bookAccessOptions)
			.set({ ...values, updatedAt: new Date().toISOString() })
			.where(and(eq(bookAccessOptions.id, accessOptionId), eq(bookAccessOptions.bookId, book.id)));
		return { accessOptionUpdated: true };
	},

	removeAccessOption: async ({ request, params, locals }) => {
		requirePermission(locals, 'book:edit');
		const book = await locals.db
			.select({ id: books.id })
			.from(books)
			.where(eq(books.slug, params.slug))
			.get();
		if (!book) return fail(404, { error: 'Book not found' });
		const data = await request.formData();
		const accessOptionId = data.get('accessOptionId')?.toString();
		if (!accessOptionId) return fail(400, { error: 'Missing access option ID.' });
		await locals.db
			.delete(bookAccessOptions)
			.where(and(eq(bookAccessOptions.id, accessOptionId), eq(bookAccessOptions.bookId, book.id)));
		return { accessOptionRemoved: true };
	},

	softDelete: async ({ params, locals }) => {
		requirePermission(locals, 'book:edit');
		const book = await locals.db.select().from(books).where(eq(books.slug, params.slug)).get();
		if (!book) return fail(404, { error: 'Book not found' });

		const now = new Date().toISOString();
		await locals.db
			.update(books)
			.set({ deletedAt: now, updatedAt: now })
			.where(eq(books.id, book.id));

		return { softDeleted: true };
	},

	restore: async ({ params, locals }) => {
		requirePermission(locals, 'book:edit');
		const book = await locals.db.select().from(books).where(eq(books.slug, params.slug)).get();
		if (!book) return fail(404, { error: 'Book not found' });

		const now = new Date().toISOString();
		await locals.db
			.update(books)
			.set({ deletedAt: null, updatedAt: now })
			.where(eq(books.id, book.id));

		return { restored: true };
	},

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

		await publishWorkerMessage(platform?.env.STORIED_WORKER, 'subject.resolve', {
			subjectSourceId: source.id,
			sourceType: source.sourceType as SubjectSourceType,
			sourceUrl: source.sourceUrl,
			sourceKey: source.sourceKey
		});

		return { retried: true };
	}
};
