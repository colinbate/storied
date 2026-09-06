import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { database } from './database.mjs';
import { conversationMembers, sessions, themes, users } from '../src/lib/server/db/schema.ts';
import { completeMagicLinkLogin } from '../src/lib/server/auth.ts';
import { getHostUser } from '../src/lib/server/host.ts';
import { createClubSession } from '../src/lib/server/session-lifecycle.ts';
import {
	load as welcomePage,
	actions as welcomeActions
} from '../src/routes/welcome/+page.server.ts';
import { load as loginPage } from '../src/routes/auth/login/+page.server.ts';

async function fixture() {
	const context = database();
	const { db } = context;
	await db.insert(themes).values({ id: 'theme', slug: 'theme', name: 'Test theme' });
	await db.insert(users).values([
		{
			id: 'host',
			email: 'host@example.test',
			displayName: 'Host',
			role: 'admin',
			lastLoginAt: '2026-01-01T00:00:00.000Z'
		},
		{ id: 'helper', email: 'helper@example.test', displayName: 'Helper', role: 'admin' },
		{ id: 'reader', email: 'reader@example.test', displayName: 'Reader' }
	]);
	const reader = await db.select().from(users).where(eq(users.id, 'reader')).get();
	const cookieJar = new Map();
	const cookies = {
		get: (name) => cookieJar.get(name),
		set: (name, value) => cookieJar.set(name, value),
		delete: (name) => cookieJar.delete(name)
	};
	const platform = { env: { ALLOW_SIGNUP: 'moderated' } };
	return { ...context, reader, cookies, cookieJar, platform };
}

const redirectTo = (expected) => (error) => {
	assert.equal(error.status, 302);
	assert.equal(error.location, expected);
	return true;
};

test('the host is the longest-standing active admin other than the current user', async () => {
	const { db } = await fixture();
	assert.equal((await getHostUser(db)).id, 'host');
	assert.equal((await getHostUser(db, 'host')).id, 'helper');
	await db.update(users).set({ status: 'suspended' }).where(eq(users.id, 'helper'));
	assert.equal(await getHostUser(db, 'host'), null);
});

test('first sign-in lands on the welcome page and later sign-ins go to the saved destination', async () => {
	const { db, cookies, platform } = await fixture();

	await assert.rejects(
		completeMagicLinkLogin(db, cookies, platform, {
			email: 'reader@example.test',
			userId: 'reader'
		}),
		redirectTo('/welcome')
	);
	assert.ok((await db.select().from(users).where(eq(users.id, 'reader')).get()).lastLoginAt);

	cookies.set('storied-redirect', '/sessions');
	await assert.rejects(
		completeMagicLinkLogin(db, cookies, platform, {
			email: 'reader@example.test',
			userId: 'reader'
		}),
		redirectTo('/sessions')
	);

	cookies.set('storied-redirect', '/thread/hello');
	await assert.rejects(
		completeMagicLinkLogin(db, cookies, platform, { email: 'new@example.test', userId: null }),
		redirectTo('/auth/login?error=pending_approval')
	);
	await db.update(users).set({ status: 'active' }).where(eq(users.email, 'new@example.test'));
	cookies.set('storied-redirect', '/thread/hello');
	await assert.rejects(
		completeMagicLinkLogin(db, cookies, platform, { email: 'new@example.test', userId: null }),
		redirectTo('/welcome?next=%2Fthread%2Fhello')
	);
});

test('the welcome page shows the next meeting and opens a conversation with the host', async () => {
	const { db, reader } = await fixture();
	await createClubSession(
		db,
		{
			id: 'meeting',
			slug: 'meeting',
			title: 'October',
			themeId: 'theme',
			startsAt: '2099-10-01T18:00',
			timezone: 'Atlantic/Bermuda',
			status: 'scheduled'
		},
		'host',
		null
	);
	const locals = { db, user: reader, permissions: new Set(['access:general']) };
	const page = await welcomePage({
		locals,
		url: new URL('https://club.example.test/welcome?next=/thread/hello')
	});
	assert.equal(page.nextSession.slug, 'meeting');
	assert.equal(page.host.id, 'host');
	assert.equal(page.next, '/thread/hello');
	assert.equal(page.isFirstVisit, true);
	assert.equal(
		(await welcomePage({ locals, url: new URL('https://club.example.test/welcome?next=//evil') }))
			.next,
		null
	);

	await assert.rejects(welcomeActions.messageHost({ locals }), (error) => {
		assert.equal(error.status, 303);
		assert.match(error.location, /^\/messages\//);
		return true;
	});
	const members = await db.select().from(conversationMembers).all();
	assert.deepEqual(members.map((row) => row.userId).sort(), ['host', 'reader']);

	const hostLocals = {
		db,
		user: await db.select().from(users).where(eq(users.id, 'host')).get(),
		permissions: new Set()
	};
	assert.equal(
		(await welcomePage({ locals: hostLocals, url: new URL('https://x.test/welcome') })).host.id,
		'helper'
	);
	assert.equal(await db.$count(sessions), 1);
});

test('the sign-in page exposes a join mode only when sign up is possible', async () => {
	const { db } = await fixture();
	const locals = { db, user: null, permissions: new Set() };
	const open = await loginPage({
		locals,
		url: new URL('https://x.test/auth/login?mode=join'),
		platform: { env: { ALLOW_SIGNUP: 'moderated' } }
	});
	assert.equal(open.mode, 'join');
	assert.equal(open.canSignup, true);

	const closed = await loginPage({
		locals,
		url: new URL('https://x.test/auth/login?mode=join'),
		platform: { env: {} }
	});
	assert.equal(closed.mode, 'signin');
	assert.equal(closed.canSignup, false);

	const invited = await loginPage({
		locals,
		url: new URL('https://x.test/auth/login?mode=join&invite=abc'),
		platform: { env: {} }
	});
	assert.equal(invited.mode, 'join');
	assert.equal(invited.canSignup, true);
});
