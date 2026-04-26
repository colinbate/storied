import { nanoid } from 'nanoid';

export function normalizeSlug(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.substring(0, 60);
}

export function slugify(text: string): string {
	const base = normalizeSlug(text);

	// Append a short random suffix to ensure uniqueness
	return `${base}-${nanoid(6)}`;
}
