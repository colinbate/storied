import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	createMagicLink,
	REDIR_COOKIE_NAME,
	TIMEZONE_COOKIE_NAME,
	TIMEZONE_COOKIE_MAX_AGE_S
} from '$lib/server/auth';
import { isValidTimezone } from '$lib/server/notification-preferences';
import { sendMagicLinkEmail } from '$lib/server/email';

export const load: PageServerLoad = async ({ locals, url, platform }) => {
	if (locals.user) {
		throw redirect(302, '/');
	}
	const error = url.searchParams.get('error');
	const canSignup = platform?.env.ALLOW_SIGNUP === 'yes';
	return {
		error,
		canSignup
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

		// Stash the browser-detected timezone in a short-lived cookie so the
		// magic-link verify handler can apply it when creating a brand-new user.
		// Safe to skip if missing or invalid — the users.timezone default kicks in.
		const browserTimezone = data.get('browserTimezone')?.toString()?.trim();
		if (browserTimezone && isValidTimezone(browserTimezone)) {
			cookies.set(TIMEZONE_COOKIE_NAME, browserTimezone, {
				path: '/',
				httpOnly: true,
				secure: true,
				sameSite: 'lax',
				maxAge: TIMEZONE_COOKIE_MAX_AGE_S
			});
		} else {
			cookies.delete(TIMEZONE_COOKIE_NAME, { path: '/' });
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
