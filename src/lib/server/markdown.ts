import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

// Configure marked for a lightweight subset
marked.setOptions({
	gfm: true,
	breaks: true
});

const ALLOWED_TAGS = [
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'p',
	'br',
	'hr',
	'ul',
	'ol',
	'li',
	'strong',
	'em',
	'del',
	's',
	'a',
	'blockquote',
	'code',
	'pre'
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
	a: ['href', 'title', 'rel', 'target'],
	code: ['class'],
	pre: ['class']
};

/** Render markdown source to sanitized HTML */
export function renderMarkdown(source: string): string {
	const raw = marked.parse(source, { async: false }) as string;
	return sanitizeHtml(raw, {
		allowedTags: ALLOWED_TAGS,
		allowedAttributes: ALLOWED_ATTRIBUTES,
		transformTags: {
			a: (tagName, attribs) => ({
				tagName,
				attribs: {
					...attribs,
					rel: 'noopener noreferrer',
					target: '_blank'
				}
			})
		}
	});
}
