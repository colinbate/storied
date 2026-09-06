import { Marked, marked, type Token, type Tokens } from 'marked';
import sanitizeHtml from 'sanitize-html';

type MentionableUser = {
	id: string;
	email: string;
	displayName: string;
};

type RenderMarkdownOptions = {
	mentionableUsers?: MentionableUser[];
};

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
	'pre',
	'details',
	'summary',
	'div',
	'span'
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
	a: ['href', 'title', 'rel', 'target', 'class'],
	code: ['class'],
	pre: ['class'],
	details: ['class'],
	summary: ['class'],
	div: ['class'],
	span: ['class', 'role', 'tabindex', 'aria-label', 'aria-expanded']
};

const spoilerExtensions = [createSpoilerBlockExtension(), createInlineSpoilerExtension()];

marked.use({ extensions: spoilerExtensions });

/** Render markdown source to sanitized HTML */
export function renderMarkdown(source: string, options: RenderMarkdownOptions = {}): string {
	const parser = options.mentionableUsers?.length
		? new Marked({
				gfm: true,
				breaks: true,
				extensions: [...spoilerExtensions, createMentionExtension(options.mentionableUsers)]
			})
		: marked;
	const raw = parser.parse(source, { async: false }) as string;
	return sanitizeHtml(raw, {
		allowedTags: ALLOWED_TAGS,
		allowedAttributes: ALLOWED_ATTRIBUTES,
		transformTags: {
			a: (tagName, attribs) => ({
				tagName,
				attribs:
					attribs.class === 'mention-link' && attribs.href?.startsWith('/members/')
						? attribs
						: {
								...attribs,
								rel: 'noopener noreferrer',
								target: '_blank'
							}
			})
		}
	});
}

function createInlineSpoilerExtension() {
	return {
		name: 'inlineSpoiler',
		level: 'inline' as const,
		start(src: string) {
			return src.indexOf('||');
		},
		tokenizer(this: { lexer: { inlineTokens: (source: string) => Token[] } }, src: string) {
			const match = /^\|\|([^\n]+?)\|\|/.exec(src);
			if (!match || !match[1].trim()) return;

			return {
				type: 'inlineSpoiler',
				raw: match[0],
				text: match[1],
				tokens: this.lexer.inlineTokens(match[1])
			};
		},
		renderer(
			this: { parser: { parseInline: (tokens: Token[]) => string } },
			token: Tokens.Generic
		) {
			return `<span class="spoiler-inline" role="button" tabindex="0" aria-label="Spoiler, select to reveal" aria-expanded="false"><span class="spoiler-inline-content">${this.parser.parseInline(token.tokens ?? [])}</span></span>`;
		},
		childTokens: ['tokens']
	};
}

function createSpoilerBlockExtension() {
	return {
		name: 'spoilerBlock',
		level: 'block' as const,
		start(src: string) {
			const match = src.match(/^:::spoiler(?:[ \t]|$)/m);
			return match?.index;
		},
		tokenizer(this: { lexer: { blockTokens: (source: string) => Token[] } }, src: string) {
			const match = /^:::spoiler(?:[ \t]+([^\n]*?))?[ \t]*\n([\s\S]*?)\n:::[ \t]*(?:\n|$)/.exec(
				src
			);
			if (!match) return;

			return {
				type: 'spoilerBlock',
				raw: match[0],
				title: match[1]?.trim() || 'Spoiler',
				tokens: this.lexer.blockTokens(match[2])
			};
		},
		renderer(this: { parser: { parse: (tokens: Token[]) => string } }, token: Tokens.Generic) {
			return `<details class="spoiler-block"><summary>${escapeHtml(token.title)}</summary><div class="spoiler-block-content">${this.parser.parse(token.tokens ?? [])}</div></details>`;
		},
		childTokens: ['tokens']
	};
}

function createMentionExtension(mentionableUsers: MentionableUser[]) {
	const mentionTargets = mentionableUsers
		.flatMap((user) => [
			{ user, target: user.displayName.trim() },
			{ user, target: user.email.trim() }
		])
		.filter(({ target }, index, targets) => {
			const normalizedTarget = normalizeMentionTarget(target);
			return (
				normalizedTarget.length > 0 &&
				targets.findIndex((item) => normalizeMentionTarget(item.target) === normalizedTarget) ===
					index
			);
		})
		.sort((a, b) => b.target.length - a.target.length)
		.map(({ user, target }) => ({
			user,
			pattern: new RegExp(`^@${targetToPattern(target)}(?=$|[^A-Za-z0-9._%+-])`, 'i')
		}));

	return {
		name: 'memberMention',
		level: 'inline' as const,
		start(src: string) {
			return src.indexOf('@');
		},
		tokenizer(src: string) {
			for (const mentionTarget of mentionTargets) {
				const match = mentionTarget.pattern.exec(src);
				if (!match) continue;

				return {
					type: 'memberMention',
					raw: match[0],
					text: match[0],
					userId: mentionTarget.user.id
				};
			}
		},
		renderer(token: { text: string; userId: string }) {
			return `<a href="/members/${encodeURIComponent(token.userId)}" class="mention-link">${escapeHtml(
				token.text
			)}</a>`;
		}
	};
}

function normalizeMentionTarget(value: string) {
	return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function targetToPattern(target: string) {
	return target
		.trim()
		.split(/\s+/)
		.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
		.join('\\s+');
}

function escapeHtml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
