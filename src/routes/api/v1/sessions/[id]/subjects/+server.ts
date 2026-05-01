import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authors, books, series, sessionSubjects, sessions } from '$lib/server/db/schema';
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

	const authorRows = await locals.db
		.select({
			linkStatus: sessionSubjects.status,
			linkNote: sessionSubjects.note,
			linkedAt: sessionSubjects.createdAt,
			updatedAt: sessionSubjects.updatedAt,
			id: authors.id,
			slug: authors.slug,
			name: authors.name,
			bio: authors.bio,
			photoUrl: authors.photoUrl,
			goodreadsUrl: authors.goodreadsUrl,
			openLibraryId: authors.openLibraryId,
			websiteUrl: authors.websiteUrl,
			createdAt: authors.createdAt
		})
		.from(sessionSubjects)
		.innerJoin(authors, eq(sessionSubjects.subjectId, authors.id))
		.where(
			and(
				eq(sessionSubjects.sessionId, session.id),
				eq(sessionSubjects.subjectType, 'author'),
				isNull(authors.deletedAt)
			)
		)
		.orderBy(asc(sessionSubjects.status), asc(sessionSubjects.createdAt), asc(authors.name))
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
			})),
			authors: authorRows.map((author) => ({
				type: 'author' as const,
				linkStatus: author.linkStatus,
				linkNote: author.linkNote,
				linkedAt: author.linkedAt,
				updatedAt: author.updatedAt,
				id: author.id,
				slug: author.slug,
				name: author.name,
				bio: author.bio,
				photoUrl: author.photoUrl,
				goodreadsUrl: author.goodreadsUrl,
				openLibraryId: author.openLibraryId,
				websiteUrl: author.websiteUrl,
				createdAt: author.createdAt
			}))
		},
		{ headers: publicApiHeaders }
	);
};
