import type { SubjectResolvePayload } from '$shared/worker-messages';
import type { Env } from '../env';
import { generateId, generateSlug } from '../shared/ids';
import {
	fetchHardcoverAuthor,
	fetchHardcoverBook,
	fetchHardcoverSeries,
	type HardcoverAuthorMetadata,
	type HardcoverBookMetadata,
	type HardcoverSeriesMetadata
} from './hardcover';
import {
	linkThreadSubject,
	linkSessionSubject,
	linkSeriesBook,
	linkUserFeaturedSubject,
	markSourceFailed
} from './links';
import { reindexSession, reindexSubject, reindexThread } from '$shared/search';

async function findResolvedSource(
	db: D1Database,
	sourceType: string,
	sourceKey: string
): Promise<string | null> {
	const row = await db
		.prepare(
			`SELECT subject_id FROM subject_sources
			 WHERE source_type = ? AND source_key = ? AND subject_id IS NOT NULL`
		)
		.bind(sourceType, sourceKey)
		.first<{ subject_id: string }>();
	return row?.subject_id ?? null;
}

async function findExistingBook(
	db: D1Database,
	metadata: HardcoverBookMetadata
): Promise<string | null> {
	const bySource = await findResolvedSource(db, 'hardcover', metadata.slug);
	if (bySource) return bySource;

	if (metadata.isbn13) {
		const byIsbn = await db
			.prepare(`SELECT id FROM books WHERE isbn13 = ?`)
			.bind(metadata.isbn13)
			.first<{ id: string }>();
		if (byIsbn) return byIsbn.id;
	}

	if (metadata.authorText) {
		const byTitleAuthor = await db
			.prepare(
				`SELECT id FROM books
				 WHERE lower(title) = lower(?) AND lower(COALESCE(author_text, '')) = lower(?)
				 AND deleted_at IS NULL`
			)
			.bind(metadata.title, metadata.authorText)
			.first<{ id: string }>();
		if (byTitleAuthor) return byTitleAuthor.id;
	}

	return null;
}

async function findExistingAuthor(
	db: D1Database,
	metadata: HardcoverAuthorMetadata
): Promise<string | null> {
	const bySource = await findResolvedSource(db, 'hardcover-author', metadata.slug);
	if (bySource) return bySource;

	const byName = await db
		.prepare(`SELECT id FROM authors WHERE lower(name) = lower(?) AND deleted_at IS NULL`)
		.bind(metadata.name)
		.first<{ id: string }>();
	return byName?.id ?? null;
}

async function findExistingSeries(
	db: D1Database,
	metadata: HardcoverSeriesMetadata
): Promise<string | null> {
	const bySource = await findResolvedSource(db, 'hardcover-series', metadata.slug);
	if (bySource) return bySource;

	if (metadata.authorText) {
		const byTitleAuthor = await db
			.prepare(
				`SELECT id FROM series
				 WHERE lower(title) = lower(?) AND lower(COALESCE(author_text, '')) = lower(?)
				 AND deleted_at IS NULL`
			)
			.bind(metadata.title, metadata.authorText)
			.first<{ id: string }>();
		if (byTitleAuthor) return byTitleAuthor.id;
	}

	return null;
}

export async function resolveHardcoverBook(
	payload: SubjectResolvePayload,
	env: Env
): Promise<void> {
	const {
		subjectSourceId,
		sourceKey,
		threadId,
		postId,
		sessionLink,
		seriesBookLink,
		userFeatureLink
	} = payload;

	const metadata = await fetchHardcoverBook(env, sourceKey);
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
			`INSERT INTO books (id, slug, title, subtitle, author_text, cover_url, isbn13, first_publish_year, description, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
			.bind(
				bookId,
				slug,
				metadata.title,
				metadata.subtitle || null,
				metadata.authorText || null,
				metadata.coverUrl || null,
				metadata.isbn13 || null,
				metadata.firstPublishYear || null,
				metadata.description || null,
				now,
				now
			)
			.run();
		console.log(`[RESOLVER] Created Hardcover book: ${metadata.title} (${bookId})`);
	} else {
		await env.DB.prepare(
			`UPDATE books SET subtitle = COALESCE(subtitle, ?), cover_url = COALESCE(cover_url, ?),
			 author_text = COALESCE(author_text, ?), isbn13 = COALESCE(isbn13, ?),
			 first_publish_year = COALESCE(first_publish_year, ?), description = COALESCE(description, ?),
			 updated_at = ?
			 WHERE id = ?`
		)
			.bind(
				metadata.subtitle || null,
				metadata.coverUrl || null,
				metadata.authorText || null,
				metadata.isbn13 || null,
				metadata.firstPublishYear || null,
				metadata.description || null,
				now,
				bookId
			)
			.run();
		console.log(`[RESOLVER] Updated existing book from Hardcover ${bookId}`);
	}

	await env.DB.prepare(
		`UPDATE subject_sources SET subject_type = 'book', subject_id = ?, fetch_status = 'resolved',
		 source_url = ?, raw_metadata = ?, last_fetched_at = ?, updated_at = ? WHERE id = ?`
	)
		.bind(bookId, metadata.hardcoverUrl, JSON.stringify(metadata), now, now, subjectSourceId)
		.run();

	await linkThreadSubject(env.DB, 'book', bookId, threadId, postId);
	await linkSessionSubject(env.DB, 'book', bookId, sessionLink);
	await linkSeriesBook(env.DB, 'book', bookId, seriesBookLink);
	await linkUserFeaturedSubject(env.DB, 'book', bookId, userFeatureLink);
	await reindexSubject(env.DB, 'book', bookId);
	if (seriesBookLink?.seriesId) await reindexSubject(env.DB, 'series', seriesBookLink.seriesId);
	if (threadId) await reindexThread(env.DB, threadId);
	if (sessionLink?.sessionId) await reindexSession(env.DB, sessionLink.sessionId);
}

export async function resolveHardcoverAuthor(
	payload: SubjectResolvePayload,
	env: Env
): Promise<void> {
	const { subjectSourceId, sourceKey, threadId, postId, sessionLink, userFeatureLink } = payload;

	const metadata = await fetchHardcoverAuthor(env, sourceKey);
	if (!metadata) {
		await markSourceFailed(env.DB, subjectSourceId);
		return;
	}

	const now = new Date().toISOString();
	let authorId = await findExistingAuthor(env.DB, metadata);

	if (!authorId) {
		authorId = generateId();
		const slug = generateSlug(metadata.name, authorId);
		await env.DB.prepare(
			`INSERT INTO authors (id, slug, name, bio, photo_url, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
			.bind(
				authorId,
				slug,
				metadata.name,
				metadata.bio || null,
				metadata.photoUrl || null,
				now,
				now
			)
			.run();
		console.log(`[RESOLVER] Created Hardcover author: ${metadata.name} (${authorId})`);
	} else {
		await env.DB.prepare(
			`UPDATE authors SET bio = COALESCE(bio, ?), photo_url = COALESCE(photo_url, ?),
			 updated_at = ?
			 WHERE id = ?`
		)
			.bind(metadata.bio || null, metadata.photoUrl || null, now, authorId)
			.run();
		console.log(`[RESOLVER] Updated existing author from Hardcover ${authorId}`);
	}

	await env.DB.prepare(
		`UPDATE subject_sources SET subject_type = 'author', subject_id = ?, fetch_status = 'resolved',
		 source_url = ?, raw_metadata = ?, last_fetched_at = ?, updated_at = ? WHERE id = ?`
	)
		.bind(authorId, metadata.hardcoverUrl, JSON.stringify(metadata), now, now, subjectSourceId)
		.run();

	await linkThreadSubject(env.DB, 'author', authorId, threadId, postId);
	await linkSessionSubject(env.DB, 'author', authorId, sessionLink);
	await linkUserFeaturedSubject(env.DB, 'author', authorId, userFeatureLink);
	await reindexSubject(env.DB, 'author', authorId);
	if (threadId) await reindexThread(env.DB, threadId);
	if (sessionLink?.sessionId) await reindexSession(env.DB, sessionLink.sessionId);
}

export async function resolveHardcoverSeries(
	payload: SubjectResolvePayload,
	env: Env
): Promise<void> {
	const {
		subjectSourceId,
		sourceKey,
		threadId,
		postId,
		sessionLink,
		seriesBookLink,
		userFeatureLink
	} = payload;

	const metadata = await fetchHardcoverSeries(env, sourceKey);
	if (!metadata) {
		await markSourceFailed(env.DB, subjectSourceId);
		return;
	}

	const now = new Date().toISOString();
	let seriesId = await findExistingSeries(env.DB, metadata);

	if (!seriesId) {
		seriesId = generateId();
		const slug = generateSlug(metadata.title, seriesId);
		await env.DB.prepare(
			`INSERT INTO series (id, slug, title, author_text, description, cover_url, book_count, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
			.bind(
				seriesId,
				slug,
				metadata.title,
				metadata.authorText || null,
				metadata.description || null,
				metadata.coverUrl || null,
				metadata.bookCount ?? null,
				now,
				now
			)
			.run();
		console.log(`[RESOLVER] Created Hardcover series: ${metadata.title} (${seriesId})`);
	} else {
		await env.DB.prepare(
			`UPDATE series SET cover_url = COALESCE(cover_url, ?), author_text = COALESCE(author_text, ?),
			 description = COALESCE(description, ?), book_count = COALESCE(?, book_count), updated_at = ?
			 WHERE id = ?`
		)
			.bind(
				metadata.coverUrl || null,
				metadata.authorText || null,
				metadata.description || null,
				metadata.bookCount ?? null,
				now,
				seriesId
			)
			.run();
		console.log(`[RESOLVER] Updated existing series from Hardcover ${seriesId}`);
	}

	await env.DB.prepare(
		`UPDATE subject_sources SET subject_type = 'series', subject_id = ?, fetch_status = 'resolved',
		 source_url = ?, raw_metadata = ?, last_fetched_at = ?, updated_at = ? WHERE id = ?`
	)
		.bind(seriesId, metadata.hardcoverUrl, JSON.stringify(metadata), now, now, subjectSourceId)
		.run();

	await linkThreadSubject(env.DB, 'series', seriesId, threadId, postId);
	await linkSessionSubject(env.DB, 'series', seriesId, sessionLink);
	await linkSeriesBook(env.DB, 'series', seriesId, seriesBookLink);
	await linkUserFeaturedSubject(env.DB, 'series', seriesId, userFeatureLink);
	await reindexSubject(env.DB, 'series', seriesId);
	if (seriesBookLink?.bookId) await reindexSubject(env.DB, 'book', seriesBookLink.bookId);
	if (threadId) await reindexThread(env.DB, threadId);
	if (sessionLink?.sessionId) await reindexSession(env.DB, sessionLink.sessionId);
}
