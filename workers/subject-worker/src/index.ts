interface Env {
	DB: D1Database;
}

type SourceType =
	| 'goodreads'
	| 'goodreads-series'
	| 'amazon'
	| 'openlibrary'
	| 'googlebooks'
	| 'manual';
type SubjectType = 'book' | 'series';

interface SubjectResolveMessage {
	subjectSourceId: string;
	sourceType: SourceType;
	sourceUrl: string;
	sourceKey: string;
	threadId?: string;
	postId?: string;
}

interface GoodreadsBookMetadata {
	title: string;
	authorText?: string;
	coverUrl?: string;
	isbn13?: string;
	description?: string;
	firstPublishYear?: number;
	goodreadsUrl: string;
}

interface GoodreadsSeriesMetadata {
	title: string;
	authorText?: string;
	description?: string;
	coverUrl?: string;
	bookCount?: number;
	goodreadsUrl: string;
}

// ────────────────────────────────
// Helpers
// ────────────────────────────────

function generateSlug(title: string, id: string): string {
	const base = title
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.substring(0, 60);
	return `${base}-${id.substring(0, 8)}`;
}

function generateId(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	const bytes = new Uint8Array(21);
	crypto.getRandomValues(bytes);
	for (const byte of bytes) result += chars[byte % chars.length];
	return result;
}

async function fetchHtml(url: string): Promise<Response | null> {
	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (compatible; StoriedBot/1.0; +https://discuss.bermudatrianglesociety.com)',
				Accept: 'text/html'
			},
			redirect: 'follow'
		});
		if (!response.ok) return null;
		return response;
	} catch (err) {
		console.error('[FETCH ERROR]', err);
		return null;
	}
}

// ────────────────────────────────
// Scraping: Goodreads book page
// ────────────────────────────────

async function scrapeGoodreadsBook(url: string): Promise<GoodreadsBookMetadata | null> {
	const response = await fetchHtml(url);
	if (!response) return null;

	const ogData: Record<string, string> = {};
	let ldJsonRaw = '';
	let capturingLdJson = false;

	const rewriter = new HTMLRewriter()
		.on('meta[property^="og:"]', {
			element(el) {
				const property = el.getAttribute('property');
				const content = el.getAttribute('content');
				if (property && content) ogData[property] = content;
			}
		})
		.on('script[type="application/ld+json"]', {
			element() {
				capturingLdJson = true;
				ldJsonRaw = '';
			},
			text(text) {
				if (capturingLdJson) {
					ldJsonRaw += text.text;
					if (text.lastInTextNode) capturingLdJson = false;
				}
			}
		});

	await rewriter.transform(response).text();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let ldJson: any;
	if (ldJsonRaw) {
		try {
			ldJson = JSON.parse(ldJsonRaw);
		} catch {
			/* ignore */
		}
	}

	const title = ldJson?.name || ogData['og:title'] || '';
	if (!title) return null;

	let authorText: string | undefined;
	if (ldJson?.author) {
		const authors = Array.isArray(ldJson.author) ? ldJson.author : [ldJson.author];
		authorText = authors
			.map((a: unknown) =>
				typeof a === 'string' ? a : (a as { name?: string } | undefined)?.name || ''
			)
			.filter(Boolean)
			.join(', ');
	}

	let isbn13: string | undefined;
	if (ldJson?.isbn && String(ldJson.isbn).length === 13) isbn13 = String(ldJson.isbn);

	let firstPublishYear: number | undefined;
	if (ldJson?.datePublished) {
		const year = new Date(String(ldJson.datePublished)).getFullYear();
		if (!isNaN(year)) firstPublishYear = year;
	}

	return {
		title: title.trim(),
		authorText,
		coverUrl: ogData['og:image'] || ldJson?.image || undefined,
		isbn13,
		description:
			(ldJson?.description || ogData['og:description'] || '').substring(0, 2000) || undefined,
		firstPublishYear,
		goodreadsUrl: ogData['og:url'] || url
	};
}

// ────────────────────────────────
// Scraping: Goodreads series page
// ────────────────────────────────

/**
 * Goodreads series pages render most content via React. The header info and the
 * book list both show up as `data-react-props` attributes on two components:
 *
 *   ReactComponents.SeriesHeader  -> { title, subtitle, description }
 *   ReactComponents.SeriesList    -> { series: [{ book: { ..., author: {..} } }] }
 *
 * We extract both blobs, parse them, and roll up the first book's author as the
 * primary series author.
 */
async function scrapeGoodreadsSeries(url: string): Promise<GoodreadsSeriesMetadata | null> {
	const response = await fetchHtml(url);
	if (!response) return null;

	const html = await response.text();

	const header = extractReactProps(html, 'ReactComponents.SeriesHeader');
	const list = extractReactProps(html, 'ReactComponents.SeriesList');

	if (!header && !list) return null;

	const title = (header?.title as string | undefined)?.replace(/\s+Series$/i, '').trim();
	if (!title) return null;

	// bookCount: parse from subtitle like "8 primary works • 17 total works"
	let bookCount: number | undefined;
	const subtitle = header?.subtitle as string | undefined;
	if (subtitle) {
		const m = subtitle.match(/(\d+)\s*primary work/i);
		if (m) bookCount = parseInt(m[1], 10);
	}

	// Description: strip tags from description.html, take up to 2000 chars.
	let description: string | undefined;
	const descHtml =
		(header?.description as { html?: string } | undefined)?.html ||
		(header?.description as { truncatedHtml?: string } | undefined)?.truncatedHtml;
	if (descHtml) {
		description = descHtml
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<[^>]+>/g, '')
			.trim()
			.substring(0, 2000);
	}

	// Author: take the author from the first book in the series list.
	let authorText: string | undefined;
	let coverUrl: string | undefined;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const seriesEntries = (list?.series as any[] | undefined) ?? [];
	for (const entry of seriesEntries) {
		const book = entry?.book;
		if (!book) continue;
		if (!coverUrl && book.imageUrl) coverUrl = book.imageUrl as string;
		if (!authorText && book.author?.name) {
			authorText = book.author.name as string;
			break;
		}
	}

	return {
		title,
		authorText,
		description,
		coverUrl,
		bookCount,
		goodreadsUrl: url
	};
}

/** Extract the data-react-props JSON for a named React component. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractReactProps(html: string, componentName: string): Record<string, any> | null {
	const escaped = componentName.replace(/\./g, '\\.');
	const regex = new RegExp(`data-react-class="${escaped}"\\s+data-react-props="([^"]+)"`, 'i');
	const match = html.match(regex);
	if (!match) return null;
	const decoded = htmlDecode(match[1]);
	try {
		return JSON.parse(decoded);
	} catch (err) {
		console.error('[SERIES] Failed to parse react props for', componentName, err);
		return null;
	}
}

function htmlDecode(input: string): string {
	return input
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

// ────────────────────────────────
// Book resolution
// ────────────────────────────────

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

async function linkThreadSubject(
	db: D1Database,
	subjectType: SubjectType,
	subjectId: string,
	threadId?: string,
	postId?: string
): Promise<void> {
	if (!threadId) return;

	const id = generateId();
	await db
		.prepare(
			`INSERT OR IGNORE INTO thread_subjects (id, thread_id, post_id, subject_type, subject_id, display_order, context, created_at)
				VALUES (?, ?, ?, ?, ?, 0, 'linked', ?)`
		)
		.bind(id, threadId, postId ?? null, subjectType, subjectId, new Date().toISOString())
		.run();
}

async function resolveGoodreadsBook(
	subjectSourceId: string,
	sourceUrl: string,
	env: Env,
	threadId?: string,
	postId?: string
): Promise<{ ok: boolean; subjectId?: string; error?: string }> {
	const metadata = await scrapeGoodreadsBook(sourceUrl);
	if (!metadata) {
		await markSourceFailed(env.DB, subjectSourceId);
		return { ok: false, error: 'Scrape failed' };
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
	return { ok: true, subjectId: bookId };
}

async function resolveGoodreadsSeries(
	subjectSourceId: string,
	sourceUrl: string,
	env: Env,
	threadId?: string,
	postId?: string
): Promise<{ ok: boolean; subjectId?: string; error?: string }> {
	const metadata = await scrapeGoodreadsSeries(sourceUrl);
	if (!metadata) {
		await markSourceFailed(env.DB, subjectSourceId);
		return { ok: false, error: 'Scrape failed' };
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
	return { ok: true, subjectId: seriesId };
}

async function markSourceFailed(db: D1Database, subjectSourceId: string): Promise<void> {
	const now = new Date().toISOString();
	await db
		.prepare(
			`UPDATE subject_sources SET fetch_status = 'failed', last_fetched_at = ?, updated_at = ? WHERE id = ?`
		)
		.bind(now, now, subjectSourceId)
		.run();
}

// ────────────────────────────────
// Queue message handling
// ────────────────────────────────

async function resolveSubjectSource(
	msg: Message<SubjectResolveMessage>,
	env: Env
): Promise<{ ok: boolean; subjectId?: string; error?: string }> {
	const { subjectSourceId, sourceType, sourceUrl, threadId, postId } = msg.body;

	try {
		const source = await env.DB.prepare(
			`SELECT id, fetch_status, subject_type, subject_id FROM subject_sources WHERE id = ?`
		)
			.bind(subjectSourceId)
			.first<{
				id: string;
				fetch_status: string;
				subject_type: string | null;
				subject_id: string | null;
			}>();

		if (!source) {
			console.log(`[RESOLVER] Source ${subjectSourceId} not found, acking`);
			msg.ack();
			return { ok: false, error: 'Source not found' };
		}

		// Already resolved — just link to the thread if needed.
		if (source.fetch_status === 'resolved' && source.subject_type && source.subject_id) {
			await linkThreadSubject(
				env.DB,
				source.subject_type as SubjectType,
				source.subject_id,
				threadId,
				postId
			);
			msg.ack();
			return { ok: true, subjectId: source.subject_id };
		}

		let result: { ok: boolean; subjectId?: string; error?: string };
		if (sourceType === 'goodreads') {
			result = await resolveGoodreadsBook(subjectSourceId, sourceUrl, env, threadId, postId);
		} else if (sourceType === 'goodreads-series') {
			result = await resolveGoodreadsSeries(subjectSourceId, sourceUrl, env, threadId, postId);
		} else {
			console.log(`[RESOLVER] Unknown source type: ${sourceType}`);
			msg.ack();
			return { ok: false, error: `Unsupported source type: ${sourceType}` };
		}

		msg.ack();
		return result;
	} catch (err) {
		console.error(`[RESOLVER] Error processing source ${subjectSourceId}:`, err);
		msg.retry();
		return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
	}
}

function fakeMessage(body: SubjectResolveMessage): Message<SubjectResolveMessage> {
	return {
		body,
		id: crypto.randomUUID(),
		timestamp: new Date(),
		attempts: 0,
		ack: () => {},
		retry: () => {},
		retryAll: () => {}
	} as unknown as Message<SubjectResolveMessage>;
}

export default {
	async queue(batch: MessageBatch<SubjectResolveMessage>, env: Env): Promise<void> {
		console.log(`[RESOLVER] Processing batch of ${batch.messages.length} messages`);
		for (const message of batch.messages) {
			await resolveSubjectSource(message, env);
		}
	},

	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname !== '/resolve') {
			return new Response(JSON.stringify({ status: 'ok', worker: 'storied-subject-worker' }), {
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const subjectSourceId = url.searchParams.get('id');
		if (!subjectSourceId) {
			return new Response(JSON.stringify({ error: 'Missing ?id= parameter' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const threadId = url.searchParams.get('thread') ?? undefined;
		const postId = url.searchParams.get('post') ?? undefined;

		const source = await env.DB.prepare(
			`SELECT id, source_type, source_url, source_key FROM subject_sources WHERE id = ?`
		)
			.bind(subjectSourceId)
			.first<{ id: string; source_type: string; source_url: string; source_key: string }>();

		if (!source) {
			return new Response(JSON.stringify({ error: 'Source not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const msg = fakeMessage({
			subjectSourceId: source.id,
			sourceType: source.source_type as SourceType,
			sourceUrl: source.source_url,
			sourceKey: source.source_key,
			threadId,
			postId
		});

		const result = await resolveSubjectSource(msg, env);
		return new Response(JSON.stringify(result), {
			status: result.ok ? 200 : 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
