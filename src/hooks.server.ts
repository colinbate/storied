import { getDb } from '$lib/server/db';
import { validateSession, SESSION_COOKIE_NAME } from '$lib/server/auth';
import { error, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

const handleDb: Handle = async ({ event, resolve }) => {
	if (!event.platform?.env.DB) {
		return error(500, 'No database available');
	}
	const db = getDb(event.platform.env.DB);
	event.locals.db = db;
	return await resolve(event);
};

const handleAuth: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.sessionId = null;

	const token = event.cookies.get(SESSION_COOKIE_NAME);
	if (token) {
		const result = await validateSession(event.locals.db, token);
		if (result) {
			event.locals.user = result.user;
			event.locals.sessionId = result.sessionId;
		}
	}

	return await resolve(event);
};

export const handle: Handle = sequence(handleDb, handleAuth);
