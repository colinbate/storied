import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	verifyMagicLink,
	findOrCreateUser,
	createSession,
	SESSION_COOKIE_NAME,
	REDIR_COOKIE_NAME,
	TIMEZONE_COOKIE_NAME
} from '$lib/server/auth';
import { isValidTimezone } from '$lib/server/notification-preferences';

export const GET: RequestHandler = async ({ url, locals, cookies, platform }) => {
	const token = url.searchParams.get('token');

	if (!token) {
		redirect(302, '/auth/login?error=missing_token');
	}

	const result = await verifyMagicLink(locals.db, token);

	if (!result) {
		redirect(302, '/auth/login?error=invalid_token');
	}

	const redir = cookies.get(REDIR_COOKIE_NAME);
	if (redir) {
		cookies.delete(REDIR_COOKIE_NAME, { path: '/' });
	}

	// Read the browser-detected timezone that the login form stashed. If the
	// magic link is clicked on a different device the cookie won't be there;
	// we fall back to the users.timezone default. If present but invalid, we
	// drop it so the default kicks in.
	const cookieTimezone = cookies.get(TIMEZONE_COOKIE_NAME);
	if (cookieTimezone) {
		cookies.delete(TIMEZONE_COOKIE_NAME, { path: '/' });
	}
	const timezone = isValidTimezone(cookieTimezone) ? cookieTimezone : undefined;

	// Find or create the user
	const { id: userId } = await findOrCreateUser(locals.db, result.email, {
		role: 'member',
		allowSignup: platform?.env.ALLOW_SIGNUP === 'yes',
		timezone
	});

	if (!userId) {
		redirect(302, '/auth/login?error=no_signup');
	}

	// Create a session
	const session = await createSession(locals.db, userId);

	cookies.set(SESSION_COOKIE_NAME, session.token, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		expires: session.expiresAt
	});

	if (redir && redir.startsWith('/')) {
		redirect(302, redir);
	}
	redirect(302, '/');
};
