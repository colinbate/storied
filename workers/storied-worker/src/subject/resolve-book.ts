import type { SubjectResolvePayload } from '$shared/worker-messages';
import type { Env } from '../env';
import { generateId, generateSlug } from '../shared/ids';
import { scrapeGoodreadsBook, type GoodreadsBookMetadata } from './scrapers';
import {
	linkThreadSubject,
	linkSessionSubject,
	linkSeriesBook,
	linkUserFeaturedSubject,
	markSourceFailed
} from './links';

async function findExistingBook(
	db: D1Database,
	metadata: GoodreadsBookMetadata
): Promise<string | null> {
	const byUrl = await db
		.prepare(`SELECT id FROM books WHERE goodreads_url = ?`)
		.bind(metadata.goodreadsUrl)
		.first<{ id: string }>();
	if (byUrl) return byUrl.id;

	if (metadata.isbn13) {
		const byIsbn = await db
			.prepare(`SELECT id FROM books WHERE isbn13 = ?`)
			.bind(metadata.isbn13)
			.first<{ id: string }>();
		if (byIsbn) return byIsbn.id;
	}

	return null;
}

export async function resolveGoodreadsBook(
	payload: SubjectResolvePayload,
	env: Env
): Promise<void> {
	const {
		subjectSourceId,
		sourceUrl,
		threadId,
		postId,
		sessionLink,
		seriesBookLink,
		userFeatureLink
	} = payload;

	const metadata = await scrapeGoodreadsBook(sourceUrl);
	if (!metadata) {
		await markSourceFailed(env.DB, subjectSourceId);
		return;
	}

	const now = new Date().toISOString();
	let bookId = await findExistingBook(env.DB, metadata);

	if (!bookId) {
		bookId = generateId();
		const slug = generateSlug(metadata.title, bookId);
		await env.DB.prepare(
			`INSERT INTO books (id, slug, title, author_text, cover_url, isbn13, goodreads_url, first_publish_year, description, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
			.bind(
				bookId,
				slug,
				metadata.title,
				metadata.authorText || null,
				metadata.coverUrl || null,
				metadata.isbn13 || null,
				metadata.goodreadsUrl,
				metadata.firstPublishYear || null,
				metadata.description || null,
				now,
				now
			)
			.run();
		console.log(`[RESOLVER] Created book: ${metadata.title} (${bookId})`);
	} else {
		await env.DB.prepare(
			`UPDATE books SET cover_url = COALESCE(cover_url, ?), author_text = COALESCE(author_text, ?),
			 description = COALESCE(description, ?), goodreads_url = COALESCE(goodreads_url, ?), updated_at = ?
			 WHERE id = ?`
		)
			.bind(
				metadata.coverUrl || null,
				metadata.authorText || null,
				metadata.description || null,
				metadata.goodreadsUrl,
				now,
				bookId
			)
			.run();
		console.log(`[RESOLVER] Updated existing book ${bookId}`);
	}

	await env.DB.prepare(
		`UPDATE subject_sources SET subject_type = 'book', subject_id = ?, fetch_status = 'resolved',
		 raw_metadata = ?, last_fetched_at = ?, updated_at = ? WHERE id = ?`
	)
		.bind(bookId, JSON.stringify(metadata), now, now, subjectSourceId)
		.run();

	await linkThreadSubject(env.DB, 'book', bookId, threadId, postId);
	await linkSessionSubject(env.DB, 'book', bookId, sessionLink);
	await linkSeriesBook(env.DB, 'book', bookId, seriesBookLink);
	await linkUserFeaturedSubject(env.DB, 'book', bookId, userFeatureLink);
}
