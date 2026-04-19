import { fetchHtml, extractReactProps } from '../shared/html';

export interface GoodreadsBookMetadata {
	title: string;
	authorText?: string;
	coverUrl?: string;
	isbn13?: string;
	description?: string;
	firstPublishYear?: number;
	goodreadsUrl: string;
}

export interface GoodreadsSeriesMetadata {
	title: string;
	authorText?: string;
	description?: string;
	coverUrl?: string;
	bookCount?: number;
	goodreadsUrl: string;
}

export async function scrapeGoodreadsBook(url: string): Promise<GoodreadsBookMetadata | null> {
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
export async function scrapeGoodreadsSeries(url: string): Promise<GoodreadsSeriesMetadata | null> {
	const response = await fetchHtml(url);
	if (!response) return null;

	const html = await response.text();

	const header = extractReactProps(html, 'ReactComponents.SeriesHeader');
	const list = extractReactProps(html, 'ReactComponents.SeriesList');

	if (!header && !list) return null;

	const title = (header?.title as string | undefined)?.replace(/\s+Series$/i, '').trim();
	if (!title) return null;

	let bookCount: number | undefined;
	const subtitle = header?.subtitle as string | undefined;
	if (subtitle) {
		const m = subtitle.match(/(\d+)\s*primary work/i);
		if (m) bookCount = parseInt(m[1], 10);
	}

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
