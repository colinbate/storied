import { getDb } from '$lib/server/db';
import { validateSession, SESSION_COOKIE_NAME } from '$lib/server/auth';
import { error, redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

const ROUTE_ACCESS: { route: string; isPrefix?: boolean; perms?: string; isApi?: boolean }[] = [
	{ route: '/api/', isPrefix: true, perms: undefined },
	{ route: '/auth/', isPrefix: true, perms: undefined },
	{ route: '/author', isPrefix: true, perms: 'access:general' },
	{ route: '/admin', isPrefix: true, perms: 'admin:view' },
	{ route: '/books', isPrefix: true, perms: 'access:general' },
	{ route: '/category/', isPrefix: true, perms: 'access:general' },
	{ route: '/library', isPrefix: true, perms: 'access:general' },
	{ route: '/new', isPrefix: false, perms: 'access:general' },
	{ route: '/search', isPrefix: true, perms: 'access:general' },
	{ route: '/series', isPrefix: true, perms: 'access:general' },
	{ route: '/settings', isPrefix: true, perms: 'access:general' },
	{ route: '/thread', isPrefix: true, perms: 'access:general' },
	{ route: '/', isPrefix: false, perms: 'access:general' },
	{ route: '/', isPrefix: true, perms: undefined }
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
	member: ['access:general'],
	moderator: [
		'access:general',
		'admin:view',
		'moderate',
		'book:edit',
		'book:promote',
		'genre:edit',
		'series:edit'
	],
	admin: [
		'access:general',
		'admin:view',
		'moderate',
		'book:edit',
		'book:promote',
		'genre:edit',
		'series:edit',
		'members:edit',
		'sessions:edit',
		'search:rebuild',
		'static-site:deploy'
	]
};

function canAccess(path: string, permissions: Set<string>) {
	for (const ra of ROUTE_ACCESS) {
		const isMatch = ra.isPrefix ? path.startsWith(ra.route) : path === ra.route;
		if (isMatch) {
			return ra.perms ? permissions.has(ra.perms) : true;
		}
	}
	return false;
}

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
	event.locals.permissions = new Set();

	const token = event.cookies.get(SESSION_COOKIE_NAME);
	if (token) {
		const result = await validateSession(event.locals.db, token);
		if (result) {
			event.locals.user = result.user;
			event.locals.sessionId = result.sessionId;
			if (result.user.status === 'active') {
				event.locals.permissions = new Set(ROLE_PERMISSIONS[result.user.role] ?? []);
			}
		} else {
			event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		}
	}
	if (!canAccess(event.url.pathname, event.locals.permissions)) {
		if (!event.locals.user) {
			redirect(303, `/auth/login?redirect=${event.url.pathname}`);
		} else {
			error(403, 'Unauthorized');
		}
	}

	return await resolve(event);
};

export const handle: Handle = sequence(handleDb, handleAuth);
