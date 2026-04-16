import { nanoid } from 'nanoid';

export function slugify(text: string): string {
	const base = text
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.substring(0, 60);

	// Append a short random suffix to ensure uniqueness
	return `${base}-${nanoid(6)}`;
}
