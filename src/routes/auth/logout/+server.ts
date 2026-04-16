import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { invalidateSession, SESSION_COOKIE_NAME } from '$lib/server/auth';

export const POST: RequestHandler = async ({ locals, cookies }) => {
	const token = cookies.get(SESSION_COOKIE_NAME);

	if (token) {
		await invalidateSession(locals.db, token);
		cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
	}

	throw redirect(302, '/auth/login');
};
