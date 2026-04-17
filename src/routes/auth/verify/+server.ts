import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	verifyMagicLink,
	findOrCreateUser,
	createSession,
	SESSION_COOKIE_NAME,
	REDIR_COOKIE_NAME
} from '$lib/server/auth';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
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

	// Find or create the user
	const { id: userId } = await findOrCreateUser(locals.db, result.email);

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
