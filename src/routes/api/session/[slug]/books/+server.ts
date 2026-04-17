import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sessions, sessionSubjects, books, userSubjects } from '$lib/server/db/schema';
import { eq, and, count, isNull } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _eq: any = eq;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _and: any = and;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _count: any = count;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _isNull: any = isNull;

const SUBJECT = 'book';

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.db
		.select()
		.from(sessions)
		.where(_eq(sessions.slug, params.slug))
		.get();

	if (!session) throw error(404, 'Session not found');

	const sessionBookRows = await locals.db
		.select({
			sessionSubject: sessionSubjects,
			book: books
		})
		.from(sessionSubjects)
		.innerJoin(books, _eq(sessionSubjects.subjectId, books.id))
		.where(
			_and(
				_eq(sessionSubjects.sessionId, session.id),
				_eq(sessionSubjects.subjectType, SUBJECT),
				_isNull(books.deletedAt)
			)
		)
		.all();

	const result = await Promise.all(
		sessionBookRows.map(async ({ sessionSubject, book }) => {
			const [recCount] = await locals.db
				.select({ count: _count() })
				.from(userSubjects)
				.where(
					_and(
						_eq(userSubjects.subjectType, SUBJECT),
						_eq(userSubjects.subjectId, book.id),
						_eq(userSubjects.isRecommended, 1)
					)
				);

			return {
				id: book.id,
				slug: book.slug,
				title: book.title,
				author: book.authorText,
				coverUrl: book.coverUrl,
				isbn13: book.isbn13,
				goodreadsUrl: book.goodreadsUrl,
				sessionStatus: sessionSubject.status,
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
