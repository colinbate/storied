import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { database } from './database.mjs';
import {
	conversationMembers,
	invites,
	signupIntroductions,
	signupTickets,
	sessions,
	themes,
	users,
	userSessions
} from '../src/lib/server/db/schema.ts';
import {
	completeMagicLinkLogin,
	createSession,
	hashToken,
	SIGNUP_TICKET_COOKIE_NAME
} from '../src/lib/server/auth.ts';
import {
	actions as introductionActions,
	load as introductionPage
} from '../src/routes/auth/introduction/+page.server.ts';
import { load as membersPage } from '../src/routes/admin/members/+page.server.ts';
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
		completeMagicLinkLogin(
			db,
			cookies,
			platform,
			{ email: 'new@example.test', userId: null },
			'I enjoy reading and live in Bermuda.'
		),
		redirectTo('/auth/login?error=pending_approval')
	);
	await db.update(users).set({ status: 'active' }).where(eq(users.email, 'new@example.test'));
	cookies.set('storied-redirect', '/thread/hello');
	await assert.rejects(
		completeMagicLinkLogin(db, cookies, platform, { email: 'new@example.test', userId: null }),
		redirectTo('/welcome?next=%2Fthread%2Fhello')
	);
});

test('login sessions remain valid for 180 days', async () => {
	const { db } = await fixture();
	const durationMs = 180 * 24 * 60 * 60 * 1000;
	const startedAt = Date.now();
	const session = await createSession(db, 'reader');
	const finishedAt = Date.now();

	assert.ok(session.expiresAt.getTime() >= startedAt + durationMs);
	assert.ok(session.expiresAt.getTime() <= finishedAt + durationMs);

	const storedSession = await db
		.select()
		.from(userSessions)
		.where(eq(userSessions.userId, 'reader'))
		.get();
	assert.equal(storedSession.expiresAt, session.expiresAt.toISOString());
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

function introductionEvent(context, fields = {}) {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return {
		locals: { db: context.db },
		cookies: context.cookies,
		platform: context.platform,
		request: new Request('https://x.test/auth/introduction', { method: 'POST', body: data })
	};
}

const expiredIntroduction = (error) => {
	assert.equal(error.status, 303);
	assert.equal(error.location, '/auth/login?error=introduction_expired');
	return true;
};

test('moderated signup requires a private introduction after verification before notifying admins', async () => {
	const context = await fixture();
	const { db, cookies, platform, cookieJar } = context;
	const messages = [];
	platform.env.STORIED_WORKER = { send: async (message) => messages.push(message) };
	cookies.set('storied-signup-name', 'New reader');
	cookies.set('storied-signup-tz', 'Atlantic/Bermuda');
	await assert.rejects(
		completeMagicLinkLogin(db, cookies, platform, { email: 'new@example.test', userId: null }),
		redirectTo('/auth/introduction')
	);
	assert.equal(await db.$count(users), 3);
	assert.equal(await db.$count(userSessions), 0);
	assert.equal(messages.length, 0);
	const ticket = await db.select().from(signupTickets).get();
	assert.notEqual(ticket.tokenHash, cookieJar.get(SIGNUP_TICKET_COOKIE_NAME));
	assert.equal(ticket.tokenHash, await hashToken(cookieJar.get(SIGNUP_TICKET_COOKIE_NAME)));
	assert.deepEqual(await introductionPage(introductionEvent(context)), {
		email: 'new@example.test',
		displayName: 'New reader'
	});

	for (const introduction of ['', '   ', 'x'.repeat(2001)]) {
		const result = await introductionActions.default(
			introductionEvent(context, {
				displayName: 'New reader',
				introduction
			})
		);
		assert.equal(result.status, 400);
		assert.equal(await db.$count(signupTickets), 1);
		assert.equal(await db.$count(users), 3);
	}
	const message = 'I live in Bermuda.\nI heard about the club from a friend.';
	await assert.rejects(
		introductionActions.default(
			introductionEvent(context, {
				displayName: 'New reader',
				introduction: `  ${message}  `,
				email: 'forged@example.test'
			})
		),
		redirectTo('/auth/login?error=pending_approval')
	);
	const member = await db.select().from(users).where(eq(users.email, 'new@example.test')).get();
	assert.equal(member.status, 'pending');
	assert.equal(member.displayName, 'New reader');
	assert.equal(member.timezone, 'Atlantic/Bermuda');
	assert.equal(await db.$count(userSessions), 0);
	assert.equal(await db.$count(signupTickets), 0);
	assert.equal((await db.select().from(signupIntroductions).get()).message, message);
	assert.equal(messages.length, 1);
	assert.equal(messages[0].topic, 'notifications.pending-signup');
	const adminData = await membersPage({ locals: { db, permissions: new Set(['members:edit']) } });
	assert.equal(adminData.members.find((user) => user.id === member.id).introduction, message);
	await assert.rejects(
		membersPage({ locals: { db, permissions: new Set() } }),
		(error) => error.status === 403
	);
	assert.equal('introduction' in member, false);

	await assert.rejects(
		introductionActions.default(
			introductionEvent(context, {
				displayName: 'New reader',
				introduction: message
			})
		),
		expiredIntroduction
	);
	await assert.rejects(
		completeMagicLinkLogin(db, cookies, platform, { email: member.email, userId: member.id }),
		redirectTo('/auth/login?error=pending_approval')
	);
	assert.equal(messages.length, 1);
});

test('missing, forged, and expired introduction tickets cannot submit membership requests', async () => {
	const context = await fixture();
	await assert.rejects(introductionPage(introductionEvent(context)), expiredIntroduction);
	context.cookies.set(SIGNUP_TICKET_COOKIE_NAME, 'forged');
	await assert.rejects(
		introductionActions.default(
			introductionEvent(context, {
				displayName: 'Reader',
				introduction: 'Hello'
			})
		),
		expiredIntroduction
	);
	await context.db.insert(signupTickets).values({
		tokenHash: await hashToken('expired'),
		email: 'new@example.test',
		expiresAt: '2000-01-01T00:00:00.000Z'
	});
	context.cookies.set(SIGNUP_TICKET_COOKIE_NAME, 'expired');
	await assert.rejects(introductionPage(introductionEvent(context)), expiredIntroduction);
	await assert.rejects(
		introductionActions.default(
			introductionEvent(context, {
				displayName: 'Reader',
				introduction: 'Hello'
			})
		),
		expiredIntroduction
	);
	assert.equal(await context.db.$count(users), 3);
});

test('open signup and valid invitations bypass the introduction step', async () => {
	const { db, cookies, platform } = await fixture();
	platform.env.ALLOW_SIGNUP = 'open';
	await assert.rejects(
		completeMagicLinkLogin(db, cookies, platform, { email: 'open@example.test', userId: null }),
		redirectTo('/welcome')
	);
	platform.env.ALLOW_SIGNUP = 'moderated';
	await db.insert(invites).values({
		id: 'invite',
		codeHash: await hashToken('valid'),
		createdByUserId: 'host',
		email: 'invited@example.test'
	});
	cookies.set('storied-invite', 'valid');
	await assert.rejects(
		completeMagicLinkLogin(db, cookies, platform, { email: 'invited@example.test', userId: null }),
		redirectTo('/welcome')
	);
	assert.equal(await db.$count(signupTickets), 0);
	assert.equal(await db.$count(signupIntroductions), 0);
	assert.equal(
		(await db.select().from(invites).get()).claimedByUserId,
		(await db.select().from(users).where(eq(users.email, 'invited@example.test')).get()).id
	);
});

test('existing pending members can supply a missing introduction when they verify again', async () => {
	const context = await fixture();
	await context.db.update(users).set({ status: 'pending' }).where(eq(users.id, 'reader'));
	await assert.rejects(
		completeMagicLinkLogin(context.db, context.cookies, context.platform, {
			email: 'reader@example.test',
			userId: 'reader'
		}),
		redirectTo('/auth/introduction')
	);
	await assert.rejects(
		introductionActions.default(
			introductionEvent(context, {
				displayName: 'Reader',
				introduction: 'I attended the last meeting.'
			})
		),
		redirectTo('/auth/login?error=pending_approval')
	);
	assert.equal(await context.db.$count(users), 3);
	assert.equal((await context.db.select().from(signupIntroductions).get()).userId, 'reader');
});
