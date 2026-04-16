import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createMagicLink } from '$lib/server/auth';
import { sendMagicLinkEmail } from '$lib/server/email';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(302, '/');
	}
};

export const actions: Actions = {
	default: async ({ request, locals, platform, url }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString()?.trim()?.toLowerCase();

		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { error: 'Please enter a valid email address.', email: email ?? '' });
		}

		try {
			const { token } = await createMagicLink(locals.db, email);
			if (platform) {
				await sendMagicLinkEmail(platform, email, token, url.origin);
			}
		} catch (err) {
			console.error('Magic link error:', err);
			// Don't reveal errors to the user for security
		}

		return { success: true, email };
	}
};
