import { POST_IMAGE_MAX_FILES, validatePostImageFile } from '$lib/post-images';
import { newId } from '$lib/server/ids';

const EXTENSIONS_BY_TYPE: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
  'image/gif': 'gif',
	'image/avif': 'avif',
};

export class PostImageUploadError extends Error {
	constructor() {
		super('The image could not be uploaded.');
		this.name = 'PostImageUploadError';
	}
}

export type PostImageInput =
	| { file: File; error: null }
	| { file: null; error: string }
	| { file: null; error: null };

export function readPostImage(formData: FormData, fieldName = 'image'): PostImageInput {
	const files = formData
		.getAll(fieldName)
		.filter((entry): entry is File => entry instanceof File && entry.size > 0);

	if (files.length > POST_IMAGE_MAX_FILES) {
		return { file: null, error: `Only ${POST_IMAGE_MAX_FILES} image can be attached.` };
	}

	const file = files[0];
	if (!file) return { file: null, error: null };

	const error = validatePostImageFile(file);
	return error ? { file: null, error } : { file, error: null };
}

export async function uploadPostImage(args: {
	platform: App.Platform | undefined;
	file: File;
	scope: 'threads' | 'posts' | 'private-messages';
	recordId: string;
}) {
	const bucket = args.platform?.env.FILES;
	if (!bucket) throw new PostImageUploadError();

	const extension = EXTENSIONS_BY_TYPE[args.file.type];
	if (!extension) throw new PostImageUploadError();

	const key = `post-images/${args.scope}/${args.recordId}/${newId()}.${extension}`;
	try {
		await bucket.put(key, await args.file.arrayBuffer(), {
			httpMetadata: {
				contentType: args.file.type,
				contentDisposition: 'inline',
				cacheControl: 'public, max-age=31536000, immutable'
			}
		});
	} catch {
		throw new PostImageUploadError();
	}

	return key;
}

export async function removePostImage(platform: App.Platform | undefined, key: string | null) {
	if (!key || !platform?.env.FILES) return;
	try {
		await platform.env.FILES.delete(key);
	} catch (error) {
		console.error('Failed to remove orphaned post image', { key, error });
	}
}
