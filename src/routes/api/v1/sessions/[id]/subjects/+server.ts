import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { books, series, sessionSubjects, sessions } from '$lib/server/db/schema';
import { and, asc, eq, isNull } from 'drizzle-orm';

const publicApiHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Cache-Control': 'public, max-age=300'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { headers: publicApiHeaders });
};

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.db
		.select({
			id: sessions.id,
			isPublic: sessions.isPublic
		})
		.from(sessions)
		.where(eq(sessions.id, params.id))
		.get();

	if (!session || !session.isPublic) {
		throw error(404, 'Session not found');
	}

	const bookRows = await locals.db
		.select({
			linkStatus: sessionSubjects.status,
			linkNote: sessionSubjects.note,
			linkedAt: sessionSubjects.createdAt,
			updatedAt: sessionSubjects.updatedAt,
			id: books.id,
			slug: books.slug,
			title: books.title,
			subtitle: books.subtitle,
			authorText: books.authorText,
			coverUrl: books.coverUrl,
			isbn13: books.isbn13,
			openLibraryId: books.openLibraryId,
			googleBooksId: books.googleBooksId,
			amazonAsin: books.amazonAsin,
			goodreadsUrl: books.goodreadsUrl,
			firstPublishYear: books.firstPublishYear,
			description: books.description,
			createdAt: books.createdAt
		})
		.from(sessionSubjects)
		.innerJoin(books, eq(sessionSubjects.subjectId, books.id))
		.where(
			and(
				eq(sessionSubjects.sessionId, session.id),
				eq(sessionSubjects.subjectType, 'book'),
				isNull(books.deletedAt)
			)
		)
		.orderBy(asc(sessionSubjects.status), asc(sessionSubjects.createdAt), asc(books.title))
		.all();

	const seriesRows = await locals.db
		.select({
			linkStatus: sessionSubjects.status,
			linkNote: sessionSubjects.note,
			linkedAt: sessionSubjects.createdAt,
			updatedAt: sessionSubjects.updatedAt,
			id: series.id,
			slug: series.slug,
			title: series.title,
			authorText: series.authorText,
			description: series.description,
			coverUrl: series.coverUrl,
			amazonAsin: series.amazonAsin,
			goodreadsUrl: series.goodreadsUrl,
			isComplete: series.isComplete,
			bookCount: series.bookCount,
			createdAt: series.createdAt
		})
		.from(sessionSubjects)
		.innerJoin(series, eq(sessionSubjects.subjectId, series.id))
		.where(
			and(
				eq(sessionSubjects.sessionId, session.id),
				eq(sessionSubjects.subjectType, 'series'),
				isNull(series.deletedAt)
			)
		)
		.orderBy(asc(sessionSubjects.status), asc(sessionSubjects.createdAt), asc(series.title))
		.all();

	return json(
		{
			sessionId: session.id,
			books: bookRows.map((book) => ({
				type: 'book' as const,
				linkStatus: book.linkStatus,
				linkNote: book.linkNote,
				linkedAt: book.linkedAt,
				updatedAt: book.updatedAt,
				id: book.id,
				slug: book.slug,
				title: book.title,
				subtitle: book.subtitle,
				authorText: book.authorText,
				coverUrl: book.coverUrl,
				isbn13: book.isbn13,
				openLibraryId: book.openLibraryId,
				googleBooksId: book.googleBooksId,
				amazonAsin: book.amazonAsin,
				goodreadsUrl: book.goodreadsUrl,
				firstPublishYear: book.firstPublishYear,
				description: book.description,
				createdAt: book.createdAt
			})),
			series: seriesRows.map((seriesRow) => ({
				type: 'series' as const,
				linkStatus: seriesRow.linkStatus,
				linkNote: seriesRow.linkNote,
				linkedAt: seriesRow.linkedAt,
				updatedAt: seriesRow.updatedAt,
				id: seriesRow.id,
				slug: seriesRow.slug,
				title: seriesRow.title,
				authorText: seriesRow.authorText,
				description: seriesRow.description,
				coverUrl: seriesRow.coverUrl,
				amazonAsin: seriesRow.amazonAsin,
				goodreadsUrl: seriesRow.goodreadsUrl,
				isComplete: seriesRow.isComplete,
				bookCount: seriesRow.bookCount,
				createdAt: seriesRow.createdAt
			}))
		},
		{ headers: publicApiHeaders }
	);
};
