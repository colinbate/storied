const SPOILER_BLOCK_PATTERN =
	/^:::spoiler(?:[ \t]+([^\n]*?))?[ \t]*\n[\s\S]*?\n:::[ \t]*(?:\n|$)/gm;
const INLINE_SPOILER_PATTERN = /\|\|[^\n]+?\|\|/g;

export const WHOLE_CONTENT_SPOILER_PREVIEW = 'Contains spoilers. Open it to reveal the content.';

export function redactSpoilers(source: string): string {
	return source
		.replace(SPOILER_BLOCK_PATTERN, (_match, title: string | undefined) =>
			title?.trim() ? `[Spoiler: ${title.trim()}]` : '[Spoiler]'
		)
		.replace(INLINE_SPOILER_PATTERN, '[spoiler]');
}

export function spoilerSafeExcerpt(
	source: string | null | undefined,
	options: { containsSpoilers?: boolean; maxLength?: number } = {}
): string | null {
	if (!source) return null;
	if (options.containsSpoilers) return WHOLE_CONTENT_SPOILER_PREVIEW;

	const normalized = redactSpoilers(source).replace(/\s+/g, ' ').trim();
	if (!normalized) return null;

	const maxLength = options.maxLength ?? 220;
	return normalized.length <= maxLength
		? normalized
		: `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
