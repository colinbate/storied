import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	authors,
	bookAuthors,
	books,
	genres,
	genreLinks,
	series,
	seriesAuthors,
	sessionSubjects,
	sessions,
	subjectSources,
	type SessionSubjectStatus
} from '$lib/server/db/schema';
import { and, asc, desc, eq } from 'drizzle-orm';
import { requirePermission } from '$lib/server/auth';
import { publishWorkerMessage, type WorkerQueueBinding } from '$lib/server/worker-queue';
import type { SubjectSourceType, SubjectType } from '$shared/worker-messages';

const SUBJECT = 'author' as const;
const sessionSubjectStatuses = new Set(['starter', 'featured', 'discussed', 'mentioned_off_theme']);

function getSessionSubjectStatus(data: FormData): SessionSubjectStatus {
	const status = data.get('status')?.toString();
	return sessionSubjectStatuses.has(status ?? '') ? (status as SessionSubjectStatus) : 'starter';
}

async function queueSubjectReindex(
	queue: WorkerQueueBinding | null | undefined,
	subjectType: SubjectType,
	subjectId: string
) {
	await publishWorkerMessage(queue, 'search.subject.reindex', { subjectType, subjectId });
}

export const load: PageServerLoad = async ({ params, locals }) => {
	requirePermission(locals, 'author:edit');

	const author = await locals.db.select().from(authors).where(eq(authors.slug, params.slug)).get();
	if (!author) throw error(404, 'Author not found');

	const [
		genreRows,
		allGenres,
		bookRows,
		seriesRows,
		allBooks,
		allSeries,
		sessionRows,
		allSessions,
		sources
	] = await Promise.all([
		locals.db
			.select({
				genreId: genreLinks.genreId,
				confidence: genreLinks.confidence,
				genre: genres
			})
			.from(genreLinks)
			.innerJoin(genres, eq(genreLinks.genreId, genres.id))
			.where(and(eq(genreLinks.subjectType, SUBJECT), eq(genreLinks.subjectId, author.id)))
			.all(),
		locals.db.select().from(genres).orderBy(asc(genres.name)).all(),
		locals.db
			.select({
				link: bookAuthors,
				book: books
			})
			.from(bookAuthors)
			.innerJoin(books, eq(bookAuthors.bookId, books.id))
			.where(eq(bookAuthors.authorId, author.id))
			.orderBy(asc(bookAuthors.displayOrder), asc(books.title))
			.all(),
		locals.db
			.select({
				link: seriesAuthors,
				series
			})
			.from(seriesAuthors)
			.innerJoin(series, eq(seriesAuthors.seriesId, series.id))
			.where(eq(seriesAuthors.authorId, author.id))
			.orderBy(asc(seriesAuthors.displayOrder), asc(series.title))
			.all(),
		locals.db
			.select({
				id: books.id,
				title: books.title,
				authorText: books.authorText,
				slug: books.slug,
				deletedAt: books.deletedAt
			})
			.from(books)
			.orderBy(asc(books.title))
			.all(),
		locals.db
			.select({
				id: series.id,
				title: series.title,
				authorText: series.authorText,
				slug: series.slug,
				deletedAt: series.deletedAt
			})
			.from(series)
			.orderBy(asc(series.title))
			.all(),
		locals.db
			.select({
				link: sessionSubjects,
				session: sessions
			})
			.from(sessionSubjects)
			.innerJoin(sessions, eq(sessionSubjects.sessionId, sessions.id))
			.where(
				and(eq(sessionSubjects.subjectType, SUBJECT), eq(sessionSubjects.subjectId, author.id))
			)
			.orderBy(desc(sessions.createdAt))
			.all(),
		locals.db
			.select({
				id: sessions.id,
				title: sessions.title,
				theme: sessions.theme,
				slug: sessions.slug
			})
			.from(sessions)
			.orderBy(desc(sessions.startsAt), desc(sessions.createdAt))
			.all(),
		locals.db
			.select()
			.from(subjectSources)
			.where(and(eq(subjectSources.subjectType, SUBJECT), eq(subjectSources.subjectId, author.id)))
			.orderBy(desc(subjectSources.updatedAt))
			.all()
	]);

	return {
		author,
		genreLinks: genreRows,
		allGenres,
		bookLinks: bookRows,
		seriesLinks: seriesRows,
		allBooks,
		allSeries,
		sessionLinks: sessionRows,
		allSessions,
		sources
	};
};

export const actions: Actions = {
	addBookLink: async ({ request, params, locals, platform }) => {
		requirePermission(locals, 'author:edit');

		const author = await locals.db
			.select()
			.from(authors)
			.where(eq(authors.slug, params.slug))
			.get();
		if (!author) return fail(404, { error: 'Author not found' });

		const bookId = (await request.formData()).get('bookId')?.toString();
		if (!bookId) return fail(400, { error: 'Select a book.' });

		await locals.db
			.insert(bookAuthors)
			.values({
				bookId,
				authorId: author.id
			})
			.onConflictDoNothing();

		await queueSubjectReindex(platform?.env.WORKER_QUEUE, 'author', author.id);
		await queueSubjectReindex(platform?.env.WORKER_QUEUE, 'book', bookId);

		return { bookLinkAdded: true };
	},

	removeBookLink: async ({ request, params, locals, platform }) => {
		requirePermission(locals, 'author:edit');

		const author = await locals.db
			.select()
			.from(authors)
			.where(eq(authors.slug, params.slug))
			.get();
		if (!author) return fail(404, { error: 'Author not found' });

		const bookId = (await request.formData()).get('bookId')?.toString();
		if (!bookId) return fail(400, { error: 'Missing book ID.' });

		await locals.db
			.delete(bookAuthors)
			.where(and(eq(bookAuthors.bookId, bookId), eq(bookAuthors.authorId, author.id)));

		await queueSubjectReindex(platform?.env.WORKER_QUEUE, 'author', author.id);
		await queueSubjectReindex(platform?.env.WORKER_QUEUE, 'book', bookId);

		return { bookLinkRemoved: true };
	},

	addSeriesLink: async ({ request, params, locals, platform }) => {
		requirePermission(locals, 'author:edit');

		const author = await locals.db
			.select()
			.from(authors)
			.where(eq(authors.slug, params.slug))
			.get();
		if (!author) return fail(404, { error: 'Author not found' });

		const seriesId = (await request.formData()).get('seriesId')?.toString();
		if (!seriesId) return fail(400, { error: 'Select a series.' });

		await locals.db
			.insert(seriesAuthors)
			.values({
				seriesId,
				authorId: author.id
			})
			.onConflictDoNothing();

		await queueSubjectReindex(platform?.env.WORKER_QUEUE, 'author', author.id);
		await queueSubjectReindex(platform?.env.WORKER_QUEUE, 'series', seriesId);

		return { seriesLinkAdded: true };
	},

	removeSeriesLink: async ({ request, params, locals, platform }) => {
		requirePermission(locals, 'author:edit');

		const author = await locals.db
			.select()
			.from(authors)
			.where(eq(authors.slug, params.slug))
			.get();
		if (!author) return fail(404, { error: 'Author not found' });

		const seriesId = (await request.formData()).get('seriesId')?.toString();
		if (!seriesId) return fail(400, { error: 'Missing series ID.' });

		await locals.db
			.delete(seriesAuthors)
			.where(and(eq(seriesAuthors.seriesId, seriesId), eq(seriesAuthors.authorId, author.id)));

		await queueSubjectReindex(platform?.env.WORKER_QUEUE, 'author', author.id);
		await queueSubjectReindex(platform?.env.WORKER_QUEUE, 'series', seriesId);

		return { seriesLinkRemoved: true };
	},

	updateMetadata: async ({ request, params, locals }) => {
		requirePermission(locals, 'author:edit');

		const author = await locals.db
			.select()
			.from(authors)
			.where(eq(authors.slug, params.slug))
			.get();
		if (!author) return fail(404, { error: 'Author not found' });

		const data = await request.formData();
		const name = data.get('name')?.toString()?.trim();
		if (!name || name.length < 2) {
			return fail(400, { error: 'Name must be at least 2 characters.' });
		}

		await locals.db
			.update(authors)
			.set({
				name,
				bio: data.get('bio')?.toString()?.trim() || null,
				photoUrl: data.get('photoUrl')?.toString()?.trim() || null,
				goodreadsUrl: data.get('goodreadsUrl')?.toString()?.trim() || null,
				openLibraryId: data.get('openLibraryId')?.toString()?.trim() || null,
				websiteUrl: data.get('websiteUrl')?.toString()?.trim() || null,
				updatedAt: new Date().toISOString()
			})
			.where(eq(authors.id, author.id));

		return { updated: true };
	},

	saveGenres: async ({ request, params, locals }) => {
		requirePermission(locals, 'author:edit');

		const author = await locals.db
			.select()
			.from(authors)
			.where(eq(authors.slug, params.slug))
			.get();
		if (!author) return fail(404, { error: 'Author not found' });

		const raw = (await request.formData()).get('genreIds')?.toString() ?? '';
		const ids = raw
			.split(',')
			.map((s) => parseInt(s.trim(), 10))
			.filter((n) => Number.isFinite(n) && n > 0);

		await locals.db
			.delete(genreLinks)
			.where(and(eq(genreLinks.subjectType, SUBJECT), eq(genreLinks.subjectId, author.id)));

		for (const genreId of ids) {
			await locals.db
				.insert(genreLinks)
				.values({
					genreId,
					subjectType: SUBJECT,
					subjectId: author.id,
					confidence: 'manual'
				})
				.onConflictDoNothing();
		}

		return { genresUpdated: true };
	},

	addSessionLink: async ({ request, params, locals }) => {
		requirePermission(locals, 'author:edit');

		const author = await locals.db
			.select()
			.from(authors)
			.where(eq(authors.slug, params.slug))
			.get();
		if (!author) return fail(404, { error: 'Author not found' });

		const data = await request.formData();
		const sessionId = data.get('sessionId')?.toString();
		if (!sessionId) return fail(400, { error: 'Select a session.' });

		await locals.db
			.insert(sessionSubjects)
			.values({
				sessionId,
				subjectType: SUBJECT,
				subjectId: author.id,
				status: getSessionSubjectStatus(data),
				note: data.get('note')?.toString()?.trim() || null,
				addedByUserId: locals.user?.id ?? null
			})
			.onConflictDoNothing();

		return { sessionLinkAdded: true };
	},

	updateSessionLink: async ({ request, params, locals }) => {
		requirePermission(locals, 'author:edit');

		const author = await locals.db
			.select()
			.from(authors)
			.where(eq(authors.slug, params.slug))
			.get();
		if (!author) return fail(404, { error: 'Author not found' });

		const data = await request.formData();
		const sessionId = data.get('sessionId')?.toString();
		if (!sessionId) return fail(400, { error: 'Missing session ID' });

		await locals.db
			.update(sessionSubjects)
			.set({
				status: getSessionSubjectStatus(data),
				note: data.get('note')?.toString()?.trim() || null,
				updatedAt: new Date().toISOString()
			})
			.where(
				and(
					eq(sessionSubjects.sessionId, sessionId),
					eq(sessionSubjects.subjectType, SUBJECT),
					eq(sessionSubjects.subjectId, author.id)
				)
			);

		return { sessionLinkUpdated: true };
	},

	removeSessionLink: async ({ request, params, locals }) => {
		requirePermission(locals, 'author:edit');

		const author = await locals.db
			.select()
			.from(authors)
			.where(eq(authors.slug, params.slug))
			.get();
		if (!author) return fail(404, { error: 'Author not found' });

		const sessionId = (await request.formData()).get('sessionId')?.toString();
		if (!sessionId) return fail(400, { error: 'Missing session ID' });

		await locals.db
			.delete(sessionSubjects)
			.where(
				and(
					eq(sessionSubjects.sessionId, sessionId),
					eq(sessionSubjects.subjectType, SUBJECT),
					eq(sessionSubjects.subjectId, author.id)
				)
			);

		return { sessionLinkRemoved: true };
	},

	softDelete: async ({ params, locals }) => {
		requirePermission(locals, 'author:edit');
		const author = await locals.db
			.select()
			.from(authors)
			.where(eq(authors.slug, params.slug))
			.get();
		if (!author) return fail(404, { error: 'Author not found' });

		const now = new Date().toISOString();
		await locals.db
			.update(authors)
			.set({ deletedAt: now, updatedAt: now })
			.where(eq(authors.id, author.id));

		return { softDeleted: true };
	},

	restore: async ({ params, locals }) => {
		requirePermission(locals, 'author:edit');
		const author = await locals.db
			.select()
			.from(authors)
			.where(eq(authors.slug, params.slug))
			.get();
		if (!author) return fail(404, { error: 'Author not found' });

		const now = new Date().toISOString();
		await locals.db
			.update(authors)
			.set({ deletedAt: null, updatedAt: now })
			.where(eq(authors.id, author.id));

		return { restored: true };
	},

	retrySource: async ({ request, locals, platform }) => {
		requirePermission(locals, 'author:edit');
		const sourceId = (await request.formData()).get('sourceId')?.toString();
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
