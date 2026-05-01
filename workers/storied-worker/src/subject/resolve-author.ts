import type { SubjectResolvePayload } from '$shared/worker-messages';
import type { Env } from '../env';
import { generateId, generateSlug } from '../shared/ids';
import { scrapeGoodreadsAuthor, type GoodreadsAuthorMetadata } from './scrapers';
import {
	linkThreadSubject,
	linkSessionSubject,
	linkUserFeaturedSubject,
	markSourceFailed
} from './links';
import { reindexSession, reindexSubject, reindexThread } from '$shared/search';

async function findExistingAuthor(
	db: D1Database,
	metadata: GoodreadsAuthorMetadata
): Promise<string | null> {
	const byUrl = await db
		.prepare(`SELECT id FROM authors WHERE goodreads_url = ?`)
		.bind(metadata.goodreadsUrl)
		.first<{ id: string }>();
	if (byUrl) return byUrl.id;

	const byName = await db
		.prepare(`SELECT id FROM authors WHERE lower(name) = lower(?) AND deleted_at IS NULL`)
		.bind(metadata.name)
		.first<{ id: string }>();
	return byName?.id ?? null;
}

export async function resolveGoodreadsAuthor(
	payload: SubjectResolvePayload,
	env: Env
): Promise<void> {
	const { subjectSourceId, sourceUrl, threadId, postId, sessionLink, userFeatureLink } = payload;

	const metadata = await scrapeGoodreadsAuthor(sourceUrl);
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
			`INSERT INTO authors (id, slug, name, bio, photo_url, goodreads_url, website_url, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
			.bind(
				authorId,
				slug,
				metadata.name,
				metadata.bio || null,
				metadata.photoUrl || null,
				metadata.goodreadsUrl,
				metadata.websiteUrl || null,
				now,
				now
			)
			.run();
		console.log(`[RESOLVER] Created author: ${metadata.name} (${authorId})`);
	} else {
		await env.DB.prepare(
			`UPDATE authors SET bio = COALESCE(bio, ?), photo_url = COALESCE(photo_url, ?),
			 goodreads_url = COALESCE(goodreads_url, ?), website_url = COALESCE(website_url, ?), updated_at = ?
			 WHERE id = ?`
		)
			.bind(
				metadata.bio || null,
				metadata.photoUrl || null,
				metadata.goodreadsUrl,
				metadata.websiteUrl || null,
				now,
				authorId
			)
			.run();
		console.log(`[RESOLVER] Updated existing author ${authorId}`);
	}

	await env.DB.prepare(
		`UPDATE subject_sources SET subject_type = 'author', subject_id = ?, fetch_status = 'resolved',
		 raw_metadata = ?, last_fetched_at = ?, updated_at = ? WHERE id = ?`
	)
		.bind(authorId, JSON.stringify(metadata), now, now, subjectSourceId)
		.run();

	await linkThreadSubject(env.DB, 'author', authorId, threadId, postId);
	await linkSessionSubject(env.DB, 'author', authorId, sessionLink);
	await linkUserFeaturedSubject(env.DB, 'author', authorId, userFeatureLink);
	await reindexSubject(env.DB, 'author', authorId);
	if (threadId) await reindexThread(env.DB, threadId);
	if (sessionLink?.sessionId) await reindexSession(env.DB, sessionLink.sessionId);
}
