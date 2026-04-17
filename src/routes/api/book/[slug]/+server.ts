import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { books, userSubjects } from '$lib/server/db/schema';
import { eq, and, count } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _eq: any = eq;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _and: any = and;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _count: any = count;

const SUBJECT = 'book';

export const GET: RequestHandler = async ({ params, locals }) => {
	const book = await locals.db.select().from(books).where(_eq(books.slug, params.slug)).get();

	if (!book || book.deletedAt) throw error(404, 'Book not found');

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

	const [readCount] = await locals.db
		.select({ count: _count() })
		.from(userSubjects)
		.where(
			_and(
				_eq(userSubjects.subjectType, SUBJECT),
				_eq(userSubjects.subjectId, book.id),
				_eq(userSubjects.readingStatus, 'read')
			)
		);

	return json(
		{
			id: book.id,
			slug: book.slug,
			title: book.title,
			subtitle: book.subtitle,
			author: book.authorText,
			coverUrl: book.coverUrl,
			isbn13: book.isbn13,
			goodreadsUrl: book.goodreadsUrl,
			firstPublishYear: book.firstPublishYear,
			recommendations: recCount.count,
			readers: readCount.count
		},
		{
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Cache-Control': 'public, max-age=300'
			}
		}
	);
};
