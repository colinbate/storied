export interface DetectedBookLink {
	url: string;
	sourceType: 'goodreads'; // expand later
	sourceKey: string; // e.g. "12345678" for goodreads
}

/**
 * Scan text (markdown source) for supported book links.
 * Returns deduplicated list of detected links.
 */
export function detectBookLinks(text: string): DetectedBookLink[] {
	const links: DetectedBookLink[] = [];
	const seen = new Set<string>();

	// Match Goodreads book URLs
	// Pattern: https://(www.)goodreads.com/book/show/<id>...
	const goodreadsRegex = /https?:\/\/(?:www\.)?goodreads\.com\/book\/show\/(\d+)[\w.-]*/gi;
	let match;
	while ((match = goodreadsRegex.exec(text)) !== null) {
		const sourceKey = match[1];
		const key = `goodreads:${sourceKey}`;
		if (!seen.has(key)) {
			seen.add(key);
			links.push({
				url: match[0],
				sourceType: 'goodreads',
				sourceKey
			});
		}
	}

	return links;
}
