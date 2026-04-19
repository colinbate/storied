import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	books,
	series,
	seriesBooks,
	genres,
	genreLinks,
	sessions,
	sessionSubjects,
	subjectSources
} from '$lib/server/db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { requirePermission } from '$lib/server/auth';
import { detectFirstSubjectLinkOfKind, ensureSubjectSource } from '$lib/server/subject-sources';
import { publishWorkerMessage } from '$lib/server/worker-queue';
import type { SubjectSourceType } from '$shared/worker-messages';

const SUBJECT = 'series' as const;

export const load: PageServerLoad = async ({ params, locals }) => {
	requirePermission(locals, 'series:edit');

	const row = await locals.db.select().from(series).where(eq(series.slug, params.slug)).get();
	if (!row) throw error(404, 'Series not found');

	// Genres
	const genreRows = await locals.db
		.select({ genreId: genreLinks.genreId, confidence: genreLinks.confidence, genre: genres })
		.from(genreLinks)
		.innerJoin(genres, eq(genreLinks.genreId, genres.id))
		.where(and(eq(genreLinks.subjectType, SUBJECT), eq(genreLinks.subjectId, row.id)))
		.all();

	const allGenres = await locals.db.select().from(genres).orderBy(asc(genres.name)).all();

	// Books in series, ordered.
	const bookRows = await locals.db
		.select({ link: seriesBooks, book: books })
		.from(seriesBooks)
		.innerJoin(books, eq(seriesBooks.bookId, books.id))
		.where(eq(seriesBooks.seriesId, row.id))
		.orderBy(asc(seriesBooks.positionSort))
		.all();

	const allBooks = await locals.db
		.select({
			id: books.id,
			title: books.title,
			authorText: books.authorText,
			slug: books.slug,
			deletedAt: books.deletedAt
		})
		.from(books)
		.orderBy(asc(books.title))
		.all();

	// Session links
	const sessionRows = await locals.db
		.select({ link: sessionSubjects, session: sessions })
		.from(sessionSubjects)
		.innerJoin(sessions, eq(sessionSubjects.sessionId, sessions.id))
		.where(and(eq(sessionSubjects.subjectType, SUBJECT), eq(sessionSubjects.subjectId, row.id)))
		.orderBy(desc(sessions.createdAt))
		.all();

	const allSessions = await locals.db
		.select({ id: sessions.id, title: sessions.title, theme: sessions.theme, slug: sessions.slug })
		.from(sessions)
		.orderBy(desc(sessions.startsAt), desc(sessions.createdAt))
		.all();

	// Sources
	const sources = await locals.db
		.select()
		.from(subjectSources)
		.where(and(eq(subjectSources.subjectType, SUBJECT), eq(subjectSources.subjectId, row.id)))
		.orderBy(desc(subjectSources.updatedAt))
		.all();

	return {
		series: row,
		genreLinks: genreRows,
		allGenres,
		bookMemberships: bookRows,
		allBooks,
		sessionLinks: sessionRows,
		allSessions,
		sources
	};
};

export const actions: Actions = {
	updateMetadata: async ({ request, params, locals }) => {
		requirePermission(locals, 'series:edit');

		const row = await locals.db.select().from(series).where(eq(series.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Series not found' });

		const data = await request.formData();
		const title = data.get('title')?.toString()?.trim();
		if (!title || title.length < 2) {
			return fail(400, { error: 'Title must be at least 2 characters.' });
		}

		const bookCountStr = data.get('bookCount')?.toString()?.trim() || '';
		const bookCount = bookCountStr ? Number(bookCountStr) : null;
		const isComplete = data.get('isComplete')?.toString() === '1' ? 1 : 0;

		await locals.db
			.update(series)
			.set({
				title,
				authorText: data.get('authorText')?.toString()?.trim() || null,
				description: data.get('description')?.toString()?.trim() || null,
				coverUrl: data.get('coverUrl')?.toString()?.trim() || null,
				amazonAsin: data.get('amazonAsin')?.toString()?.trim() || null,
				goodreadsUrl: data.get('goodreadsUrl')?.toString()?.trim() || null,
				isComplete,
				bookCount: bookCount && Number.isFinite(bookCount) ? bookCount : null,
				updatedAt: new Date().toISOString()
			})
			.where(eq(series.id, row.id));

		return { updated: true };
	},

	saveGenres: async ({ request, params, locals }) => {
		requirePermission(locals, 'series:edit');
		const row = await locals.db.select().from(series).where(eq(series.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Series not found' });

		const data = await request.formData();
		const raw = data.get('genreIds')?.toString() ?? '';
		const ids = raw
			.split(',')
			.map((s) => parseInt(s.trim(), 10))
			.filter((n) => Number.isFinite(n) && n > 0);

		await locals.db
			.delete(genreLinks)
			.where(and(eq(genreLinks.subjectType, SUBJECT), eq(genreLinks.subjectId, row.id)));

		for (const genreId of ids) {
			await locals.db
				.insert(genreLinks)
				.values({
					genreId,
					subjectType: SUBJECT,
					subjectId: row.id,
					confidence: 'manual'
				})
				.onConflictDoNothing();
		}

		return { genresUpdated: true };
	},

	addBook: async ({ request, params, locals, platform }) => {
		requirePermission(locals, 'series:edit');

		const row = await locals.db.select().from(series).where(eq(series.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Series not found' });

		const data = await request.formData();
		const mode = data.get('mode')?.toString();
		const position = data.get('position')?.toString()?.trim() || null;
		const positionSortStr = data.get('positionSort')?.toString()?.trim() || '';
		const positionSort = positionSortStr ? Number(positionSortStr) : null;

		if (mode === 'url') {
			const url = data.get('url')?.toString()?.trim() || '';
			const link = detectFirstSubjectLinkOfKind(url, 'book');
			if (!link) return fail(400, { error: 'Only Goodreads book URLs are supported.' });

			const result = await ensureSubjectSource(locals.db, link, platform?.env, {
				seriesBookLink: {
					seriesId: row.id,
					position,
					positionSort: positionSort && Number.isFinite(positionSort) ? positionSort : null
				}
			});
			if (result.resolvedSubjectId) return { bookAdded: true };
			return { queuedBook: true };
		}

		const bookId = data.get('bookId')?.toString();
		if (!bookId) return fail(400, { error: 'Select a book to add.' });

		await locals.db
			.insert(seriesBooks)
			.values({
				seriesId: row.id,
				bookId,
				position,
				positionSort: positionSort && Number.isFinite(positionSort) ? positionSort : null
			})
			.onConflictDoNothing();

		return { bookAdded: true };
	},

	updateBookMembership: async ({ request, params, locals }) => {
		requirePermission(locals, 'series:edit');
		const row = await locals.db.select().from(series).where(eq(series.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Series not found' });

		const data = await request.formData();
		const bookId = data.get('bookId')?.toString();
		if (!bookId) return fail(400, { error: 'Missing book ID' });

		const position = data.get('position')?.toString()?.trim() || null;
		const positionSortStr = data.get('positionSort')?.toString()?.trim() || '';
		const positionSort = positionSortStr ? Number(positionSortStr) : null;

		await locals.db
			.update(seriesBooks)
			.set({
				position,
				positionSort: positionSort && Number.isFinite(positionSort) ? positionSort : null
			})
			.where(and(eq(seriesBooks.seriesId, row.id), eq(seriesBooks.bookId, bookId)));

		return { membershipUpdated: true };
	},

	removeBook: async ({ request, params, locals }) => {
		requirePermission(locals, 'series:edit');
		const row = await locals.db.select().from(series).where(eq(series.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Series not found' });

		const data = await request.formData();
		const bookId = data.get('bookId')?.toString();
		if (!bookId) return fail(400, { error: 'Missing book ID' });

		await locals.db
			.delete(seriesBooks)
			.where(and(eq(seriesBooks.seriesId, row.id), eq(seriesBooks.bookId, bookId)));

		return { bookRemoved: true };
	},

	addSessionLink: async ({ request, params, locals }) => {
		requirePermission(locals, 'series:edit');
		const row = await locals.db.select().from(series).where(eq(series.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Series not found' });

		const data = await request.formData();
		const sessionId = data.get('sessionId')?.toString();
		if (!sessionId) return fail(400, { error: 'Select a session.' });

		const status = data.get('status')?.toString() || 'mentioned';
		const note = data.get('note')?.toString()?.trim() || null;

		await locals.db
			.insert(sessionSubjects)
			.values({
				sessionId,
				subjectType: SUBJECT,
				subjectId: row.id,
				status,
				note,
				addedByUserId: locals.user?.id ?? null
			})
			.onConflictDoNothing();

		return { sessionLinkAdded: true };
	},

	updateSessionLink: async ({ request, params, locals }) => {
		requirePermission(locals, 'series:edit');
		const row = await locals.db.select().from(series).where(eq(series.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Series not found' });

		const data = await request.formData();
		const sessionId = data.get('sessionId')?.toString();
		if (!sessionId) return fail(400, { error: 'Missing session ID' });

		const status = data.get('status')?.toString() || 'mentioned';
		const note = data.get('note')?.toString()?.trim() || null;

		await locals.db
			.update(sessionSubjects)
			.set({ status, note, updatedAt: new Date().toISOString() })
			.where(
				and(
					eq(sessionSubjects.sessionId, sessionId),
					eq(sessionSubjects.subjectType, SUBJECT),
					eq(sessionSubjects.subjectId, row.id)
				)
			);

		return { sessionLinkUpdated: true };
	},

	removeSessionLink: async ({ request, params, locals }) => {
		requirePermission(locals, 'series:edit');
		const row = await locals.db.select().from(series).where(eq(series.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Series not found' });

		const data = await request.formData();
		const sessionId = data.get('sessionId')?.toString();
		if (!sessionId) return fail(400, { error: 'Missing session ID' });

		await locals.db
			.delete(sessionSubjects)
			.where(
				and(
					eq(sessionSubjects.sessionId, sessionId),
					eq(sessionSubjects.subjectType, SUBJECT),
					eq(sessionSubjects.subjectId, row.id)
				)
			);

		return { sessionLinkRemoved: true };
	},

	softDelete: async ({ params, locals }) => {
		requirePermission(locals, 'series:edit');
		const row = await locals.db.select().from(series).where(eq(series.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Series not found' });

		const now = new Date().toISOString();
		await locals.db
			.update(series)
			.set({ deletedAt: now, updatedAt: now })
			.where(eq(series.id, row.id));
		return { softDeleted: true };
	},

	restore: async ({ params, locals }) => {
		requirePermission(locals, 'series:edit');
		const row = await locals.db.select().from(series).where(eq(series.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Series not found' });

		const now = new Date().toISOString();
		await locals.db
			.update(series)
			.set({ deletedAt: null, updatedAt: now })
			.where(eq(series.id, row.id));
		return { restored: true };
	},

	retrySource: async ({ request, locals, platform }) => {
		requirePermission(locals, 'series:edit');
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

		await publishWorkerMessage(platform?.env.WORKER_QUEUE, 'subject.resolve', {
			subjectSourceId: source.id,
			sourceType: source.sourceType as SubjectSourceType,
			sourceUrl: source.sourceUrl,
			sourceKey: source.sourceKey
		});

		return { retried: true };
	}
};
