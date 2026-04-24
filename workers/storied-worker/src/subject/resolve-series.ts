import type { SubjectResolvePayload } from '$shared/worker-messages';
import type { Env } from '../env';
import { generateId, generateSlug } from '../shared/ids';
import { scrapeGoodreadsSeries, type GoodreadsSeriesMetadata } from './scrapers';
import {
	linkThreadSubject,
	linkSessionSubject,
	linkSeriesBook,
	linkUserFeaturedSubject,
	markSourceFailed
} from './links';

async function findExistingSeries(
	db: D1Database,
	metadata: GoodreadsSeriesMetadata
): Promise<string | null> {
	const byUrl = await db
		.prepare(`SELECT id FROM series WHERE goodreads_url = ?`)
		.bind(metadata.goodreadsUrl)
		.first<{ id: string }>();
	return byUrl?.id ?? null;
}

export async function resolveGoodreadsSeries(
	payload: SubjectResolvePayload,
	env: Env
): Promise<void> {
	const { subjectSourceId, sourceUrl, threadId, postId, sessionLink, seriesBookLink, userFeatureLink } =
		payload;

	const metadata = await scrapeGoodreadsSeries(sourceUrl);
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
			`INSERT INTO series (id, slug, title, author_text, description, cover_url, goodreads_url, book_count, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
			.bind(
				seriesId,
				slug,
				metadata.title,
				metadata.authorText || null,
				metadata.description || null,
				metadata.coverUrl || null,
				metadata.goodreadsUrl,
				metadata.bookCount ?? null,
				now,
				now
			)
			.run();
		console.log(`[RESOLVER] Created series: ${metadata.title} (${seriesId})`);
	} else {
		await env.DB.prepare(
			`UPDATE series SET cover_url = COALESCE(cover_url, ?), author_text = COALESCE(author_text, ?),
			 description = COALESCE(description, ?), goodreads_url = COALESCE(goodreads_url, ?),
			 book_count = COALESCE(?, book_count), updated_at = ?
			 WHERE id = ?`
		)
			.bind(
				metadata.coverUrl || null,
				metadata.authorText || null,
				metadata.description || null,
				metadata.goodreadsUrl,
				metadata.bookCount ?? null,
				now,
				seriesId
			)
			.run();
		console.log(`[RESOLVER] Updated existing series ${seriesId}`);
	}

	await env.DB.prepare(
		`UPDATE subject_sources SET subject_type = 'series', subject_id = ?, fetch_status = 'resolved',
		 raw_metadata = ?, last_fetched_at = ?, updated_at = ? WHERE id = ?`
	)
		.bind(seriesId, JSON.stringify(metadata), now, now, subjectSourceId)
		.run();

	await linkThreadSubject(env.DB, 'series', seriesId, threadId, postId);
	await linkSessionSubject(env.DB, 'series', seriesId, sessionLink);
	await linkSeriesBook(env.DB, 'series', seriesId, seriesBookLink);
	await linkUserFeaturedSubject(env.DB, 'series', seriesId, userFeatureLink);
}
