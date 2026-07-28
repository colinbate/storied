export const POST_IMAGE_MAX_FILES = 1;
export const POST_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const POST_IMAGE_ACCEPTED_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp',
  'image/gif',
	'image/avif',
] as const;

export const POST_IMAGE_ACCEPT = POST_IMAGE_ACCEPTED_TYPES.join(',');
export const POST_IMAGE_MAX_SIZE_LABEL = '8 MB';

export function validatePostImageFile(file: File): string | null {
	if (!(POST_IMAGE_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
		return 'Choose a JPG, PNG, WebP, AVIF or GIF image.';
	}

	if (file.size > POST_IMAGE_MAX_BYTES) {
		return `Image must be ${POST_IMAGE_MAX_SIZE_LABEL} or smaller.`;
	}

	return null;
}

export function publicPostImageUrl(baseUrl: string, key: string | null | undefined) {
	if (!key || !baseUrl) return null;
	return `${baseUrl.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
}
