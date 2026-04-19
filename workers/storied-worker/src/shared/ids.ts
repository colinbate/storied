const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function generateId(): string {
	let result = '';
	const bytes = new Uint8Array(21);
	crypto.getRandomValues(bytes);
	for (const byte of bytes) result += ID_CHARS[byte % ID_CHARS.length];
	return result;
}

export function generateSlug(title: string, id: string): string {
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
