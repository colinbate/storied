import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { database } from './database.mjs';
import { books, sessions, sessionSubjects, users } from '../src/lib/server/db/schema.ts';
import { sessionAccessCondition } from '../src/lib/server/session-lifecycle.ts';
import { loadLibrarySubjects } from '../src/lib/server/library.ts';
import { load as homePage } from '../src/routes/+page.server.ts';
import { load as welcomePage } from '../src/routes/welcome/+page.server.ts';
import { isCompletedSession, selectNextSession } from '../shared/session-lifecycle.ts';

const now = new Date('2026-10-08T18:00:00Z');
const candidate = (id, extra = {}) => ({
	id,
	status: 'scheduled',
	startsAt: '2026-10-09T18:00:00Z',
	timezone: 'UTC',
	durationMinutes: 90,
	liveStartedAt: null,
	liveEndedAt: null,
	...extra
});

test('next session skips explicit and timed completion while keeping running meetings', () => {
	const future = candidate('future');
	const ended = candidate('ended', { status: 'current', liveEndedAt: now.toISOString() });
	const elapsed = candidate('elapsed', {
		status: 'current',
		startsAt: '2026-10-08T16:30:00Z'
	});
	assert.equal(selectNextSession([ended, future], now), future);
	assert.equal(selectNextSession([elapsed, future], now), future);
	assert.equal(selectNextSession([ended, elapsed], now), null);
	assert.equal(isCompletedSession(elapsed, now), true);
	const live = { ...elapsed, liveStartedAt: '2026-10-08T16:30:00Z' };
	assert.equal(isCompletedSession(live, now), false);
	assert.equal(selectNextSession([future, live], now), live);
	assert.equal(
		selectNextSession([{ ...live, liveEndedAt: now.toISOString() }, future], now),
		future
	);
	const withinDuration = { ...elapsed, startsAt: '2026-10-08T17:00:00Z' };
	assert.equal(selectNextSession([future, withinDuration], now), withinDuration);
});

test('next session preserves current priority and orders upcoming meetings by their timezone', () => {
	const utc = candidate('utc', { startsAt: '2026-10-09T18:00', timezone: 'UTC' });
	const bermuda = candidate('bermuda', {
		startsAt: '2026-10-09T17:00',
		timezone: 'Atlantic/Bermuda'
	});
	const candidates = [bermuda, utc];
	assert.equal(selectNextSession(candidates, now), utc);
	assert.deepEqual(candidates, [bermuda, utc]);
	const current = candidate('current', { status: 'current', startsAt: '2026-10-10T18:00Z' });
	assert.equal(selectNextSession([...candidates, current], now), current);
});

test('next session excludes drafts, cancelled, past, undated, and invalid meetings', () => {
	const excluded = [
		candidate('draft', { status: 'draft' }),
		candidate('cancelled', { status: 'cancelled' }),
		candidate('past', { status: 'past' }),
		candidate('undated', { startsAt: null }),
		candidate('invalid', { status: 'current', startsAt: 'invalid' })
	];
	assert.equal(selectNextSession(excluded, now), null);
	assert.equal(selectNextSession([], now), null);
});

async function fixture(current, includeFuture = true) {
	const context = database();
	const { db } = context;
	await db
		.insert(users)
		.values({ id: 'reader', email: 'reader@example.test', displayName: 'Reader' });
	const user = await db.select().from(users).where(eq(users.id, 'reader')).get();
	const locals = { db, user, permissions: new Set(['access:general']) };
	await db.insert(sessions).values([
		{ id: 'current', slug: 'current', title: 'Current meeting', status: 'current', ...current },
		{
			id: 'draft',
			slug: 'draft',
			title: 'Draft meeting',
			status: 'draft',
			startsAt: '2099-01-01T18:00Z'
		},
		...(includeFuture
			? [
					{
						id: 'future',
						slug: 'future',
						title: 'Future meeting',
						status: 'scheduled',
						startsAt: '2099-10-01T18:00Z'
					}
				]
			: [])
	]);
	await db.insert(books).values({ id: 'book', slug: 'book', title: 'Book' });
	await db.insert(sessionSubjects).values({
		sessionId: 'current',
		subjectType: 'book',
		subjectId: 'book',
		status: 'discussed'
	});
	return { ...context, locals };
}

async function pages(locals) {
	const [home, welcome, library] = await Promise.all([
		homePage({ locals }),
		welcomePage({ locals, url: new URL('https://club.example.test/welcome') }),
		loadLibrarySubjects(locals.db, {
			userId: locals.user.id,
			sessionAccess: sessionAccessCondition(locals)
		})
	]);
	return { home, welcome, library };
}

for (const [name, current] of [
	[
		'explicitly ended',
		{
			startsAt: '2099-06-01T18:00Z',
			liveStartedAt: '2026-10-08T16:00Z',
			liveEndedAt: '2026-10-08T17:00Z'
		}
	],
	['ended by timing', { startsAt: '2000-01-01T18:00Z', durationMinutes: 90 }]
]) {
	test(`home, welcome, and library skip an ${name} current meeting and retain its recap`, async () => {
		const { locals } = await fixture(current);
		const { home, welcome, library } = await pages(locals);
		assert.equal(home.currentSession.id, 'future');
		assert.equal(home.canRsvpToCurrentSession, true);
		assert.equal(home.featuredRecap.slug, 'current');
		assert.equal(home.pastSessions[0].id, 'current');
		assert.equal(welcome.nextSession.id, 'future');
		assert.equal(library.nextSession.id, 'future');
		assert.equal(library.books[0].sessionLinks[0].sessionId, 'current');
		assert.equal(
			library.sessionOptions.some((session) => session.id === 'draft'),
			false
		);
	});
}

test('running meetings stay visible across home, welcome, and library after scheduled end', async () => {
	const { locals } = await fixture({
		startsAt: '2000-01-01T18:00Z',
		liveStartedAt: '2000-01-01T18:00Z'
	});
	const { home, welcome, library } = await pages(locals);
	assert.equal(home.currentSession.id, 'current');
	assert.equal(home.upcomingSession.slug, 'future');
	assert.equal(home.featuredRecap, null);
	assert.equal(home.canRsvpToCurrentSession, false);
	assert.deepEqual(home.pastSessions, []);
	assert.equal(welcome.nextSession.id, 'current');
	assert.equal(library.nextSession.id, 'current');
});

test('no upcoming meeting leaves preparation empty and preserves recap, including for editors', async () => {
	const { locals } = await fixture({ startsAt: '2000-01-01T18:00Z' }, false);
	for (const permissions of [
		new Set(['access:general']),
		new Set(['access:general', 'sessions:edit'])
	]) {
		const { home, welcome, library } = await pages({ ...locals, permissions });
		assert.equal(home.currentSession, null);
		assert.equal(home.upcomingSession, null);
		assert.equal(home.featuredRecap.slug, 'current');
		assert.equal(home.canRsvpToCurrentSession, false);
		assert.equal(welcome.nextSession, null);
		assert.equal(welcome.nextSessionRsvpStatus, null);
		assert.equal(library.nextSession, null);
		assert.equal(
			library.sessionOptions.some((session) => session.id === 'draft'),
			permissions.has('sessions:edit')
		);
	}
});
