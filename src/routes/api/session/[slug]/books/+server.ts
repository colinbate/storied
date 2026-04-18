import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sessions, sessionSubjects, books, userSubjects } from '$lib/server/db/schema';
import { eq, and, count, isNull } from 'drizzle-orm';

const SUBJECT = 'book';

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.db
		.select()
		.from(sessions)
		.where(eq(sessions.slug, params.slug))
		.get();

	if (!session) throw error(404, 'Session not found');

	const sessionBookRows = await locals.db
		.select({
			sessionSubject: sessionSubjects,
			book: books
		})
		.from(sessionSubjects)
		.innerJoin(books, eq(sessionSubjects.subjectId, books.id))
		.where(
			and(
				eq(sessionSubjects.sessionId, session.id),
				eq(sessionSubjects.subjectType, SUBJECT),
				isNull(books.deletedAt)
			)
		)
		.all();

	const result = await Promise.all(
		sessionBookRows.map(async ({ sessionSubject, book }) => {
			const [recCount] = await locals.db
				.select({ count: count() })
				.from(userSubjects)
				.where(
					and(
						eq(userSubjects.subjectType, SUBJECT),
						eq(userSubjects.subjectId, book.id),
						eq(userSubjects.isRecommended, 1)
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
