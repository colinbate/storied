interface Env {
	DB: D1Database;
}

interface BookResolveMessage {
	bookSourceId: string;
	sourceType: string;
	sourceUrl: string;
	sourceKey: string;
	threadId?: string;
	postId?: string;
}

interface GoodreadsMetadata {
	title: string;
	authorText?: string;
	coverUrl?: string;
	isbn13?: string;
	description?: string;
	firstPublishYear?: number;
	goodreadsUrl: string;
}

async function scrapeGoodreads(url: string): Promise<GoodreadsMetadata | null> {
	// Fetch with user-agent, use HTMLRewriter to extract og: tags and ld+json
	// Same approach as described in the goodreads-scraper utility
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
	} catch (err) {
		console.error('[SCRAPE ERROR]', err);
		return null;
	}
}

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
	// Simple random ID for the worker (no nanoid dependency)
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	const bytes = new Uint8Array(21);
	crypto.getRandomValues(bytes);
	for (const byte of bytes) {
		result += chars[byte % chars.length];
	}
	return result;
}

async function findExistingBook(
	db: D1Database,
	metadata: GoodreadsMetadata
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

async function createPostBookLink(
	db: D1Database,
	bookId: string,
	bookSourceId: string,
	threadId?: string,
	postId?: string
): Promise<void> {
	if (!threadId && !postId) return;

	// Check for existing link to avoid duplicates
	let existing: { id: string } | null = null;
	if (postId) {
		existing = await db
			.prepare(`SELECT id FROM post_books WHERE post_id = ? AND book_id = ?`)
			.bind(postId, bookId)
			.first<{ id: string }>();
	} else if (threadId) {
		existing = await db
			.prepare(`SELECT id FROM post_books WHERE thread_id = ? AND book_id = ? AND post_id IS NULL`)
			.bind(threadId, bookId)
			.first<{ id: string }>();
	}

	if (existing) return;

	const id = generateId();
	await db
		.prepare(
			`INSERT INTO post_books (id, post_id, thread_id, book_id, book_source_id, display_order, context, created_at)
		 VALUES (?, ?, ?, ?, ?, 0, 'linked', ?)`
		)
		.bind(id, postId || null, threadId || null, bookId, bookSourceId, new Date().toISOString())
		.run();
}

async function resolveBookSource(
	msg: Message<BookResolveMessage>,
	env: Env
): Promise<{ ok: boolean; bookId?: string; error?: string }> {
	const { bookSourceId, sourceType, sourceUrl, threadId, postId } = msg.body;

	try {
		// Check if source still needs resolving (might have been resolved by a previous message for same source)
		const source = await env.DB.prepare(
			`SELECT id, fetch_status, canonical_book_id FROM book_sources WHERE id = ?`
		)
			.bind(bookSourceId)
			.first<{ id: string; fetch_status: string; canonical_book_id: string | null }>();

		if (!source) {
			console.log(`[BOOK RESOLVER] Source ${bookSourceId} not found, acking`);
			msg.ack();
			return { ok: false, error: 'Source not found' };
		}

		// If already resolved, just create the post_books link if needed
		if (source.fetch_status === 'resolved' && source.canonical_book_id) {
			await createPostBookLink(env.DB, source.canonical_book_id, bookSourceId, threadId, postId);
			msg.ack();
			return { ok: true, bookId: source.canonical_book_id };
		}

		let metadata: GoodreadsMetadata | null = null;
		if (sourceType === 'goodreads') {
			metadata = await scrapeGoodreads(sourceUrl);
		}

		if (!metadata) {
			const now = new Date().toISOString();
			await env.DB.prepare(
				`UPDATE book_sources SET fetch_status = 'failed', last_fetched_at = ?, updated_at = ? WHERE id = ?`
			)
				.bind(now, now, bookSourceId)
				.run();
			console.log(`[BOOK RESOLVER] Failed to resolve source ${bookSourceId}`);
			msg.ack(); // Don't retry scrape failures — they'll need manual intervention
			return { ok: false, error: 'Scrape failed' };
		}

		// Find or create book
		let bookId = await findExistingBook(env.DB, metadata);
		const now = new Date().toISOString();

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
			console.log(`[BOOK RESOLVER] Created book: ${metadata.title} (${bookId})`);
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
			console.log(`[BOOK RESOLVER] Updated existing book ${bookId}`);
		}

		// Link source to book
		await env.DB.prepare(
			`UPDATE book_sources SET canonical_book_id = ?, fetch_status = 'resolved', raw_metadata = ?, last_fetched_at = ?, updated_at = ? WHERE id = ?`
		)
			.bind(bookId, JSON.stringify(metadata), now, now, bookSourceId)
			.run();

		// Create post_books link
		await createPostBookLink(env.DB, bookId, bookSourceId, threadId, postId);

		console.log(`[BOOK RESOLVER] Resolved source ${bookSourceId} -> book ${bookId}`);
		msg.ack();
		return { ok: true, bookId };
	} catch (err) {
		console.error(`[BOOK RESOLVER] Error processing source ${bookSourceId}:`, err);
		msg.retry(); // Retry on unexpected errors
		return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
	}
}

function fakeMessage(body: BookResolveMessage): Message<BookResolveMessage> {
	return {
		body,
		id: crypto.randomUUID(),
		timestamp: new Date(),
		attempts: 0,
		ack: () => {},
		retry: () => {},
		retryAll: () => {}
	} as unknown as Message<BookResolveMessage>;
}

export default {
	async queue(batch: MessageBatch<BookResolveMessage>, env: Env): Promise<void> {
		console.log(`[BOOK RESOLVER] Processing batch of ${batch.messages.length} messages`);

		for (const message of batch.messages) {
			await resolveBookSource(message, env);
		}
	},

	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname !== '/resolve') {
			return new Response(JSON.stringify({ status: 'ok', worker: 'storied-book-resolver' }), {
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const bookSourceId = url.searchParams.get('id');
		if (!bookSourceId) {
			return new Response(JSON.stringify({ error: 'Missing ?id= parameter' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const threadId = url.searchParams.get('thread') ?? undefined;
		const postId = url.searchParams.get('post') ?? undefined;

		// Look up the source to build the message
		const source = await env.DB.prepare(
			`SELECT id, source_type, source_url, source_key FROM book_sources WHERE id = ?`
		)
			.bind(bookSourceId)
			.first<{ id: string; source_type: string; source_url: string; source_key: string }>();

		if (!source) {
			return new Response(JSON.stringify({ error: 'Source not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const msg = fakeMessage({
			bookSourceId: source.id,
			sourceType: source.source_type,
			sourceUrl: source.source_url,
			sourceKey: source.source_key,
			threadId,
			postId
		});

		const result = await resolveBookSource(msg, env);
		return new Response(JSON.stringify(result), {
			status: result.ok ? 200 : 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
