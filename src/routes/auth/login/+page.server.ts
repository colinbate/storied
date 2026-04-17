import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createMagicLink, REDIR_COOKIE_NAME } from '$lib/server/auth';
import { sendMagicLinkEmail } from '$lib/server/email';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	if (locals.user) {
		throw redirect(302, '/');
	}
	const error = url.searchParams.get('error');

	return {
		error
	};
};

export const actions: Actions = {
	default: async ({ request, locals, platform, url, cookies }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString()?.trim()?.toLowerCase();

		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { error: 'Please enter a valid email address.', email: email ?? '' });
		}

		const redir = url.searchParams.get('redirect');
		if (redir && redir.startsWith('/')) {
			cookies.set(REDIR_COOKIE_NAME, redir, { path: '/' });
		} else {
			cookies.delete(REDIR_COOKIE_NAME, { path: '/' });
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
