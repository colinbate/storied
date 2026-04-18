import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/auth/login');
	return { user: locals.user };
};

export const actions: Actions = {
	updateProfile: async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/auth/login');

		const data = await request.formData();
		const displayName = data.get('displayName')?.toString()?.trim();

		if (!displayName || displayName.length < 2 || displayName.length > 50) {
			return fail(400, { error: 'Display name must be between 2 and 50 characters.' });
		}

		await locals.db
			.update(users)
			.set({ displayName, updatedAt: new Date().toISOString() })
			.where(eq(users.id, locals.user.id));

		return { success: true };
	},

	uploadAvatar: async ({ request, locals, platform }) => {
		if (!locals.user) throw redirect(302, '/auth/login');

		const data = await request.formData();
		const file = data.get('avatar');

		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { avatarError: 'Please select a file.' });
		}

		// Validate file type
		const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
		if (!allowedTypes.includes(file.type)) {
			return fail(400, { avatarError: 'Only PNG, JPG, and WEBP images are allowed.' });
		}

		// Validate file size (1MB max)
		if (file.size > 1024 * 1024) {
			return fail(400, { avatarError: 'File must be under 1MB.' });
		}

		if (!platform?.env.FILES) {
			return fail(500, { avatarError: 'File storage is not available.' });
		}

		// Determine extension from MIME type
		const extMap: Record<string, string> = {
			'image/png': 'png',
			'image/jpeg': 'jpg',
			'image/webp': 'webp'
		};
		const ext = extMap[file.type] || 'jpg';
		const key = `avatars/${locals.user.id}.${ext}`;

		// Upload to R2
		const arrayBuffer = await file.arrayBuffer();
		await platform.env.FILES.put(key, arrayBuffer, {
			httpMetadata: {
				contentType: file.type
			}
		});

		// Build the public URL
		const baseUrl = platform.env.FILE_BASE_URL || '';
		const avatarUrl = `${baseUrl}/${key}`;

		// Update user record
		await locals.db
			.update(users)
			.set({ avatarUrl, updatedAt: new Date().toISOString() })
			.where(eq(users.id, locals.user.id));

		return { avatarSuccess: true };
	}
};
