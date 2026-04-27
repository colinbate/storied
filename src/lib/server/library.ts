import { authors, books, series } from '$lib/server/db/schema';
import { asc, isNull } from 'drizzle-orm';

export async function loadLibrarySubjects(db: App.Locals['db']) {
	const [bookRows, seriesRows, authorRows] = await Promise.all([
		db
			.select({
				id: books.id,
				slug: books.slug,
				title: books.title,
				subtitle: books.subtitle,
				authorText: books.authorText,
				coverUrl: books.coverUrl,
				firstPublishYear: books.firstPublishYear,
				description: books.description
			})
			.from(books)
			.where(isNull(books.deletedAt))
			.orderBy(asc(books.title))
			.all(),
		db
			.select({
				id: series.id,
				slug: series.slug,
				title: series.title,
				authorText: series.authorText,
				coverUrl: series.coverUrl,
				bookCount: series.bookCount,
				isComplete: series.isComplete,
				description: series.description
			})
			.from(series)
			.where(isNull(series.deletedAt))
			.orderBy(asc(series.title))
			.all(),
		db
			.select({
				id: authors.id,
				slug: authors.slug,
				name: authors.name,
				bio: authors.bio,
				photoUrl: authors.photoUrl
			})
			.from(authors)
			.where(isNull(authors.deletedAt))
			.orderBy(asc(authors.name))
			.all()
	]);

	return {
		books: bookRows,
		series: seriesRows,
		authors: authorRows
	};
}
