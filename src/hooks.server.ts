import { getDb } from '$lib/server/db';
import { error, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

const handleDb: Handle = async ({ event, resolve }) => {
	if (!event.platform?.env.DB) {
		return error(500, 'No database available');
	}
	const db = getDb(event.platform.env.DB);
	event.locals.db = db;
	const res = await resolve(event);
	return res;
};

const handleAuth: Handle = async ({ event, resolve }) => {
	// TODO: Handle logins
	return await resolve(event);
};

export const handle: Handle = sequence(handleDb, handleAuth);
