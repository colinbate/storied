import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authors, bookAuthors, books, series, seriesAuthors } from '$lib/server/db/schema';
import { and, asc, eq, isNull } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, params }) => {
	const author = await locals.db
		.select()
		.from(authors)
		.where(and(eq(authors.slug, params.slug), isNull(authors.deletedAt)))
		.get();

	if (!author) {
		error(404, 'Author not found');
	}

	const [relatedBooks, relatedSeries] = await Promise.all([
		locals.db
			.select({
				id: books.id,
				slug: books.slug,
				title: books.title,
				subtitle: books.subtitle,
				authorText: books.authorText,
				coverUrl: books.coverUrl,
				firstPublishYear: books.firstPublishYear
			})
			.from(bookAuthors)
			.innerJoin(books, eq(bookAuthors.bookId, books.id))
			.where(and(eq(bookAuthors.authorId, author.id), isNull(books.deletedAt)))
			.orderBy(asc(bookAuthors.displayOrder), asc(books.title))
			.all(),
		locals.db
			.select({
				id: series.id,
				slug: series.slug,
				title: series.title,
				authorText: series.authorText,
				coverUrl: series.coverUrl,
				bookCount: series.bookCount,
				isComplete: series.isComplete
			})
			.from(seriesAuthors)
			.innerJoin(series, eq(seriesAuthors.seriesId, series.id))
			.where(and(eq(seriesAuthors.authorId, author.id), isNull(series.deletedAt)))
			.orderBy(asc(seriesAuthors.displayOrder), asc(series.title))
			.all()
	]);

	return { author, relatedBooks, relatedSeries };
};
