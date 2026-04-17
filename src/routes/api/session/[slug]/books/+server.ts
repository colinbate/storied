import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sessions, sessionBooks, books, userBooks } from '$lib/server/db/schema';
import { eq, and, count } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _eq: any = eq;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _and: any = and;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _count: any = count;

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.db
		.select()
		.from(sessions)
		.where(_eq(sessions.slug, params.slug))
		.get();

	if (!session) throw error(404, 'Session not found');

	const sessionBookRows = await locals.db
		.select({
			sessionBook: sessionBooks,
			book: books
		})
		.from(sessionBooks)
		.innerJoin(books, _eq(sessionBooks.bookId, books.id))
		.where(_eq(sessionBooks.sessionId, session.id))
		.all();

	const result = await Promise.all(
		sessionBookRows.map(async ({ sessionBook, book }) => {
			const [recCount] = await locals.db
				.select({ count: _count() })
				.from(userBooks)
				.where(_and(_eq(userBooks.bookId, book.id), _eq(userBooks.isRecommended, 1)));

			return {
				id: book.id,
				slug: book.slug,
				title: book.title,
				author: book.authorText,
				coverUrl: book.coverUrl,
				isbn13: book.isbn13,
				goodreadsUrl: book.goodreadsUrl,
				sessionStatus: sessionBook.status,
				recommendations: recCount.count
			};
		})
	);

	return json(result, {
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'public, max-age=300'
		}
	});
};
