import { Marked, marked } from 'marked';
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
	'pre'
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
	a: ['href', 'title', 'rel', 'target', 'class'],
	code: ['class'],
	pre: ['class']
};

/** Render markdown source to sanitized HTML */
export function renderMarkdown(source: string, options: RenderMarkdownOptions = {}): string {
	const parser = options.mentionableUsers?.length
		? new Marked({
				gfm: true,
				breaks: true,
				extensions: [createMentionExtension(options.mentionableUsers)]
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
