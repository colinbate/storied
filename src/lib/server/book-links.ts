export type SubjectSourceType = 'goodreads' | 'goodreads-series' | 'goodreads-author';
export type SubjectKind = 'book' | 'series' | 'author';

export interface DetectedSubjectLink {
	url: string;
	sourceType: SubjectSourceType;
	sourceKey: string;
	subjectKind: SubjectKind;
}

/** Back-compat alias for the old name. */
export type DetectedBookLink = DetectedSubjectLink;

/**
 * Scan text (markdown source) for supported subject links.
 * Returns deduplicated list of detected links.
 */
export function detectSubjectLinks(text: string): DetectedSubjectLink[] {
	const links: DetectedSubjectLink[] = [];
	const seen = new Set<string>();

	const push = (link: DetectedSubjectLink) => {
		const key = `${link.sourceType}:${link.sourceKey}`;
		if (seen.has(key)) return;
		seen.add(key);
		links.push(link);
	};

	// Goodreads book URLs: https://(www.)goodreads.com/book/show/<id>...
	const bookRegex = /https?:\/\/(?:www\.)?goodreads\.com\/book\/show\/(\d+)[\w.-]*/gi;
	let match: RegExpExecArray | null;
	while ((match = bookRegex.exec(text)) !== null) {
		push({
			url: match[0],
			sourceType: 'goodreads',
			sourceKey: match[1],
			subjectKind: 'book'
		});
	}

	// Goodreads series URLs: https://(www.)goodreads.com/series/<id>[-slug]
	const seriesRegex = /https?:\/\/(?:www\.)?goodreads\.com\/series\/(\d+)[\w.-]*/gi;
	while ((match = seriesRegex.exec(text)) !== null) {
		push({
			url: match[0],
			sourceType: 'goodreads-series',
			sourceKey: match[1],
			subjectKind: 'series'
		});
	}

	// Goodreads author URLs: https://(www.)goodreads.com/author/show/<id>.<slug>
	const authorRegex = /https?:\/\/(?:www\.)?goodreads\.com\/author\/show\/(\d+)[\w.-]*/gi;
	while ((match = authorRegex.exec(text)) !== null) {
		push({
			url: match[0],
			sourceType: 'goodreads-author',
			sourceKey: match[1],
			subjectKind: 'author'
		});
	}

	return links;
}

/** @deprecated Use detectSubjectLinks. Retained for compatibility. */
export const detectBookLinks = detectSubjectLinks;
