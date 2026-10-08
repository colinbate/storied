import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { database } from './database.mjs';
import {
	attendeeIdentities,
	notificationEvents,
	notificationPreferences,
	sessionParticipants,
	sessions,
	users,
	invites
} from '../src/lib/server/db/schema.ts';
import { canLeaveClub, leaveClub } from '../src/lib/server/member-departure.ts';
import {
	createMagicLink,
	createSession,
	validateSession,
	verifyMagicLink,
	completeMagicLinkLogin,
	hashToken,
	SESSION_COOKIE_NAME
} from '../src/lib/server/auth.ts';
import {
	createCalendarSubscription,
	subscribedMeetingCalendar
} from '../src/lib/server/session-calendar.ts';
import { actions as settings } from '../src/routes/settings/+page.server.ts';
import { actions as admin } from '../src/routes/admin/members/+page.server.ts';
import { load as profile } from '../src/routes/members/[id]/+page.server.ts';
import { actions as publicRsvp } from '../src/routes/rsvp/[eventSlug]/+page.server.ts';
import { promoteNextWaitlisted } from '../src/lib/server/rsvp.ts';
import { handlePushoverNotification } from '../workers/storied-worker/src/notifications/pushover.ts';
import { handlePrivateMessageNotification } from '../workers/storied-worker/src/notifications/queue-private-message.ts';
import { deliverSessionReminder } from '../shared/session-reminder-delivery.ts';

async function fixture() {
	const context = database();
	const { db, binding, sqlite } = context;
	const batch = binding.batch.bind(binding);
	let pending = Promise.resolve();
	binding.batch = (statements) => {
		const result = pending.then(() => batch(statements));
		pending = result.catch(() => {});
		return result;
	};
	await db.insert(users).values([
		{
			id: 'reader',
			email: 'reader@example.test',
			displayName: 'Reader',
			lastLoginAt: '2026-01-01T00:00:00Z'
		},
		{ id: 'host', email: 'host@example.test', displayName: 'Host', role: 'admin' },
		{ id: 'other', email: 'other@example.test', displayName: 'Other' },
		{ id: 'inactive', email: 'inactive@example.test', displayName: 'Inactive', status: 'suspended' }
	]);
	await db.insert(attendeeIdentities).values([
		{
			id: 'reader',
			userId: 'reader',
			name: 'Reader',
			email: 'reader@example.test',
			emailNormalized: 'reader@example.test'
		},
		{ id: 'other', userId: 'other', name: 'Other', email: 'other@example.test' },
		{ id: 'inactive', userId: 'inactive', name: 'Inactive', email: 'inactive@example.test' },
		{ id: 'guest', name: 'Guest', email: 'guest@example.test' }
	]);
	await db.insert(sessions).values({
		id: 'future',
		slug: 'future',
		title: 'Future meeting',
		startsAt: '2099-10-01T18:00',
		timezone: 'UTC',
		durationMinutes: 90,
		status: 'scheduled',
		rsvpCapacity: 1,
		isPublic: true
	});
	await db.insert(sessionParticipants).values([
		{
			id: 'reader',
			sessionId: 'future',
			attendeeId: 'reader',
			nameSnapshot: 'Reader',
			attendanceStatus: 'attending'
		},
		{
			id: 'inactive',
			sessionId: 'future',
			attendeeId: 'inactive',
			nameSnapshot: 'Inactive',
			attendanceStatus: 'waitlisted',
			createdAt: '2026-01-01T00:00:00Z'
		},
		{
			id: 'guest',
			sessionId: 'future',
			attendeeId: 'guest',
			nameSnapshot: 'Guest',
			attendanceStatus: 'waitlisted',
			createdAt: '2026-01-02T00:00:00Z'
		},
		{
			id: 'other',
			sessionId: 'future',
			attendeeId: 'other',
			nameSnapshot: 'Other',
			attendanceStatus: 'waitlisted',
			createdAt: '2026-01-03T00:00:00Z'
		}
	]);
	await db.insert(notificationPreferences).values({
		userId: 'reader',
		emailEnabled: true,
		marketingEnabled: true,
		pushoverEnabled: true,
		pushoverUserKey: 'key',
		digestHourLocal: 12
	});
	await db.insert(notificationEvents).values([
		{ id: 'pending', userId: 'reader', eventType: 'private_message' },
		{ id: 'failed', userId: 'reader', eventType: 'private_message', status: 'failed' },
		{ id: 'sent', userId: 'reader', eventType: 'private_message', status: 'sent' }
	]);
	sqlite.exec(
		"INSERT INTO categories(id,slug,name) VALUES ('category','departure','Departure'); INSERT INTO threads(id,category_id,author_user_id,title,slug,body_source,body_html) VALUES ('thread','category','reader','Thread','thread','Retained post','<p>Retained post</p>'); INSERT INTO posts(id,thread_id,author_user_id,body_source,body_html) VALUES ('post','thread','reader','Retained reply','<p>Retained reply</p>'); INSERT INTO subscriptions(id,user_id,thread_id,mode) VALUES ('subscription','reader','thread','immediate'); INSERT INTO groups(id,slug,name,created_by_user_id) VALUES ('group','group','Group','host'); INSERT INTO group_memberships(group_id,user_id) VALUES ('group','reader'); INSERT INTO user_profiles(user_id,bio) VALUES ('reader','Saved profile'); INSERT INTO books(id,slug,title) VALUES ('book','book','Book'); INSERT INTO user_subjects(user_id,subject_type,subject_id) VALUES ('reader','book','book'); INSERT INTO session_reading_choices(session_id,attendee_id,book_id) VALUES ('future','reader','book'); INSERT INTO conversations(id,created_by_user_id) VALUES ('conversation','reader'); INSERT INTO conversation_members(conversation_id,user_id) VALUES ('conversation','reader'),('conversation','other'); INSERT INTO private_messages(id,conversation_id,author_user_id,body_source,body_html) VALUES ('message','conversation','reader','Saved message','<p>Saved message</p>'),('queued','conversation','other','Queued reply','<p>Queued reply</p>');"
	);
	const reader = await db.select().from(users).where(eq(users.id, 'reader')).get();
	const host = await db.select().from(users).where(eq(users.id, 'host')).get();
	const locals = { db, user: reader, permissions: new Set(['access:general']) };
	const facilitator = { db, user: host, permissions: new Set(['access:general', 'members:edit']) };
	const cookies = {
		jar: new Map(),
		get(name) {
			return this.jar.get(name);
		},
		set(name, value) {
			this.jar.set(name, value);
		},
		delete(name) {
			this.jar.delete(name);
		}
	};
	const sent = [];
	const platform = {
		env: { SEND_EMAILS: true, EMAIL: { send: async (email) => sent.push(email) } }
	};
	const action = (fields = { confirmDeparture: 'on', confirmation: 'LEAVE' }, extra = {}) =>
		settings.leaveClub({
			locals,
			cookies,
			platform,
			url: new URL('https://example.test/settings'),
			request: new Request('https://example.test/settings', {
				method: 'POST',
				body: new URLSearchParams(fields)
			}),
			...extra
		});
	const status = async (id) =>
		(await db.select().from(sessionParticipants).where(eq(sessionParticipants.id, id)).get())
			.attendanceStatus;
	return { ...context, locals, facilitator, cookies, platform, sent, action, status };
}

test('departure confirms intent, acts only on the current member, revokes every login and calendar, and promotes one eligible RSVP', async () => {
	const { db, locals, cookies, action, status, sent } = await fixture();
	const first = await createSession(db, 'reader');
	const second = await createSession(db, 'reader');
	cookies.set(SESSION_COOKIE_NAME, first.token);
	const magic = await createMagicLink(db, locals.user.email);
	const calendarUrl = await createCalendarSubscription(db, 'reader', true);
	const calendarToken = new URL(calendarUrl).pathname.split('/')[2];
	for (const fields of [
		{},
		{ confirmation: 'LEAVE' },
		{ confirmDeparture: 'on', confirmation: 'leave' }
	]) {
		assert.equal((await action(fields)).status, 400);
		assert.equal(
			(await db.select().from(users).where(eq(users.id, 'reader')).get()).status,
			'active'
		);
	}
	await assert.rejects(
		action({ confirmDeparture: 'on', confirmation: 'LEAVE', userId: 'other' }),
		(error) => error.status === 303 && error.location === '/auth/login?left=1'
	);
	assert.equal(
		(await db.select().from(users).where(eq(users.id, 'reader')).get()).status,
		'suspended'
	);
	assert.ok((await db.select().from(users).where(eq(users.id, 'reader')).get()).leftAt);
	assert.equal((await db.select().from(users).where(eq(users.id, 'other')).get()).status, 'active');
	assert.equal(await validateSession(db, first.token), null);
	assert.equal(await validateSession(db, second.token), null);
	assert.equal(cookies.get(SESSION_COOKIE_NAME), undefined);
	assert.equal(await verifyMagicLink(db, magic.token), null);
	assert.equal((await subscribedMeetingCalendar(db, calendarToken)).status, 404);
	assert.equal(await status('reader'), 'cancelled');
	assert.equal(await status('guest'), 'attending');
	assert.equal(await status('inactive'), 'waitlisted');
	assert.equal(await status('other'), 'waitlisted');
	assert.equal(sent.length, 1);
	assert.equal(sent[0].to, 'guest@example.test');
	assert.match(sent[0].subject, /spot opened/);
	assert.equal((await action()).status, 409);
	assert.equal(sent.length, 1);
});

test('departure retains authored content, reading history, profile and private conversations while cancelling notifications and memberships', async () => {
	const { db, sqlite, facilitator } = await fixture();
	const retained = [
		'users',
		'threads',
		'posts',
		'books',
		'user_profiles',
		'user_subjects',
		'session_reading_choices',
		'conversations',
		'conversation_members',
		'private_messages'
	];
	const before = Object.fromEntries(
		retained.map((table) => [table, sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n])
	);
	assert.equal((await leaveClub(db, 'reader')).left, true);
	for (const table of retained)
		assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, before[table]);
	await assert.rejects(
		profile({ locals: facilitator, params: { id: 'reader' } }),
		(e) => e.status === 404
	);
	const prefs = await db
		.select()
		.from(notificationPreferences)
		.where(eq(notificationPreferences.userId, 'reader'))
		.get();
	for (const key of [
		'emailEnabled',
		'marketingEnabled',
		'pushoverEnabled',
		'autoSubscribeOwn',
		'autoSubscribeSessionThreads'
	])
		assert.equal(prefs[key], false);
	assert.equal(prefs.digestHourLocal, null);
	assert.equal(
		sqlite.prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE user_id = 'reader'").get().n,
		0
	);
	assert.equal(
		sqlite.prepare("SELECT COUNT(*) AS n FROM group_memberships WHERE user_id = 'reader'").get().n,
		0
	);
	assert.deepEqual(
		(await db.select().from(notificationEvents).all()).map((row) => row.status),
		['cancelled', 'cancelled', 'sent']
	);
	assert.equal(
		sqlite.prepare("SELECT COUNT(*) AS n FROM moderation_events WHERE action = 'leave_club'").get()
			.n,
		1
	);
});

for (const [extra, expected] of [
	[{ startsAt: '2025-01-01T18:00' }, 'attending'],
	[{ status: 'past' }, 'attending'],
	[{ liveStartedAt: '2026-10-08T10:00:00Z' }, 'attending'],
	[{ liveEndedAt: '2026-10-08T10:00:00Z' }, 'attending'],
	[{ startsAt: null }, 'attending'],
	[{ rsvpEnabled: false }, 'cancelled'],
	[{ status: 'cancelled' }, 'cancelled']
]) {
	test(`departure preserves history or cancels a future RSVP with ${JSON.stringify(extra)}`, async () => {
		const { db, status } = await fixture();
		await db.update(sessions).set(extra).where(eq(sessions.id, 'future'));
		assert.equal((await leaveClub(db, 'reader')).left, true);
		assert.equal(await status('reader'), expected);
		assert.equal(await status('guest'), 'waitlisted');
	});
}

test('a departing waitlisted or tentative member releases no occupied place', async () => {
	for (const attendanceStatus of ['waitlisted', 'maybe']) {
		const { db, status } = await fixture();
		await db
			.update(sessionParticipants)
			.set({ attendanceStatus })
			.where(eq(sessionParticipants.id, 'reader'));
		const result = await leaveClub(db, 'reader');
		assert.equal(await status('reader'), 'cancelled');
		assert.deepEqual(result.promotedIds, []);
		assert.equal(await status('guest'), 'waitlisted');
	}
});

test('one batch failure rolls back departure, cancellations, the audit and session revocation', async () => {
	const { db, sqlite, status } = await fixture();
	const login = await createSession(db, 'reader');
	sqlite.exec(
		"CREATE TRIGGER fail_departure BEFORE UPDATE OF attendance_status ON session_participants WHEN NEW.id = 'reader' AND NEW.attendance_status = 'cancelled' BEGIN SELECT RAISE(ABORT, 'Simulated failure'); END;"
	);
	await assert.rejects(leaveClub(db, 'reader'), /Simulated failure/);
	assert.equal(
		(await db.select().from(users).where(eq(users.id, 'reader')).get()).status,
		'active'
	);
	assert.ok(await validateSession(db, login.token));
	assert.equal(await status('reader'), 'attending');
	assert.equal(
		sqlite.prepare("SELECT COUNT(*) AS n FROM moderation_events WHERE action = 'leave_club'").get()
			.n,
		0
	);
});

test('last-administrator protection is atomic when two administrators try to leave together', async () => {
	const { db, sqlite } = await fixture();
	assert.equal(await canLeaveClub(db, 'host'), false);
	assert.equal((await leaveClub(db, 'host')).left, false);
	assert.equal((await db.select().from(users).where(eq(users.id, 'host')).get()).status, 'active');
	assert.equal(
		sqlite.prepare("SELECT COUNT(*) AS n FROM moderation_events WHERE action = 'leave_club'").get()
			.n,
		0
	);
	await db.update(users).set({ role: 'admin' }).where(eq(users.id, 'other'));
	const outcomes = await Promise.all([leaveClub(db, 'host'), leaveClub(db, 'other')]);
	assert.deepEqual(outcomes.map((row) => row.left).sort(), [false, true]);
	assert.equal(
		sqlite
			.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'")
			.get().n,
		1
	);
	const left = await db.select().from(users).where(eq(users.role, 'member')).all();
	assert.equal(left.filter((member) => member.leftAt).length, 1);
});

test('concurrent departure attempts produce one cancellation, promotion and audit', async () => {
	const { db, sqlite, status } = await fixture();
	const results = await Promise.all([leaveClub(db, 'reader'), leaveClub(db, 'reader')]);
	assert.deepEqual(results.map((row) => row.left).sort(), [false, true]);
	assert.equal(results.flatMap((row) => row.promotedIds).length, 1);
	assert.equal(await status('guest'), 'attending');
	assert.equal(await status('other'), 'waitlisted');
	assert.equal(
		sqlite.prepare("SELECT COUNT(*) AS n FROM moderation_events WHERE action = 'leave_club'").get()
			.n,
		1
	);
});

for (const [change, expected, promoted] of [
	["UPDATE sessions SET starts_at = '2099-10-02T18:00' WHERE id = 'future'", 'cancelled', 1],
	["UPDATE sessions SET starts_at = '2025-10-02T18:00' WHERE id = 'future'", 'attending', 0],
	[
		"UPDATE session_participants SET attendance_status = 'waitlisted' WHERE id = 'reader'",
		'cancelled',
		0
	],
	[
		"INSERT INTO sessions(id,slug,title,starts_at,timezone,status) VALUES ('new','new','New meeting','2099-10-02T18:00','UTC','scheduled'); INSERT INTO session_participants(id,session_id,attendee_id,name_snapshot,attendance_status) VALUES ('new','new','reader','Reader','attending')",
		'cancelled',
		1
	]
]) {
	test(`departure retries a concurrent registration change: ${change.split(' ')[0]} ${expected} ${promoted}`, async () => {
		const { db, binding, sqlite, status } = await fixture();
		const batch = binding.batch.bind(binding);
		let attempts = 0;
		binding.batch = (statements) => {
			if (attempts++ === 0) sqlite.exec(change);
			return batch(statements);
		};
		const result = await leaveClub(db, 'reader');
		assert.equal(result.left, true);
		assert.equal(attempts, 2);
		assert.equal(await status('reader'), expected);
		assert.equal(result.promotedIds.length, promoted);
		if (change.startsWith('INSERT')) assert.equal(await status('new'), 'cancelled');
		assert.equal(
			sqlite
				.prepare("SELECT COUNT(*) AS n FROM moderation_events WHERE action = 'leave_club'")
				.get().n,
			1
		);
	});
}

test('continued schedule changes ask the member to retry without partially leaving', async () => {
	const { db, binding, sqlite, action, status } = await fixture();
	const batch = binding.batch.bind(binding);
	let changes = 0;
	binding.batch = (statements) => {
		sqlite.exec(
			`UPDATE sessions SET starts_at = '2099-10-0${++changes + 1}T18:00' WHERE id = 'future'`
		);
		return batch(statements);
	};
	const result = await action();
	assert.equal(result.status, 409);
	assert.match(result.data.departureError, /Please try again/);
	assert.equal(
		(await db.select().from(users).where(eq(users.id, 'reader')).get()).status,
		'active'
	);
	assert.equal(await status('reader'), 'attending');
});

test('only administrator reactivation enables rejoining; invitations and open signup cannot restore departed access', async () => {
	const { db, sqlite, cookies, facilitator } = await fixture();
	const old = await createSession(db, 'reader');
	await leaveClub(db, 'reader');
	await db.insert(invites).values({
		id: 'invite',
		codeHash: await hashToken('invite-code'),
		email: 'reader@example.test',
		createdByUserId: 'host',
		expiresAt: '2099-10-01T00:00:00Z'
	});
	for (const ALLOW_SIGNUP of ['open', 'moderated', undefined]) {
		cookies.set('storied-invite', 'invite-code');
		await assert.rejects(
			completeMagicLinkLogin(
				db,
				cookies,
				{ env: { ALLOW_SIGNUP } },
				{ email: 'reader@example.test', userId: 'reader' }
			),
			(e) => e.location === '/auth/login?error=left'
		);
		assert.equal(
			(await db.select().from(users).where(eq(users.id, 'reader')).get()).status,
			'suspended'
		);
	}
	assert.equal((await db.select().from(invites).get()).claimedAt, null);
	assert.throws(
		() => sqlite.exec("UPDATE users SET status = 'active' WHERE id = 'reader'"),
		/explicit reactivation/
	);
	await assert.rejects(createSession(db, 'reader'), (e) => e.status === 403);
	const response = await admin.updateStatus({
		locals: facilitator,
		platform: undefined,
		url: new URL('https://example.test/admin/members'),
		request: new Request('https://example.test/admin/members', {
			method: 'POST',
			body: new URLSearchParams({ userId: 'reader', status: 'active' })
		})
	});
	assert.equal(response.updatedStatus, 'active');
	assert.equal(await validateSession(db, old.token), null);
	const login = await createSession(db, 'reader');
	assert.ok(await validateSession(db, login.token));
	assert.equal(
		(
			await db
				.select()
				.from(notificationPreferences)
				.where(eq(notificationPreferences.userId, 'reader'))
				.get()
		).emailEnabled,
		false
	);
	assert.equal(
		(await db.select().from(sessionParticipants).where(eq(sessionParticipants.id, 'reader')).get())
			.attendanceStatus,
		'cancelled'
	);
});

test('departed members cannot regain RSVP access through the public form or an in-flight database write', async () => {
	const { db, sqlite, locals, platform, status } = await fixture();
	await leaveClub(db, 'reader');
	const response = await publicRsvp.default({
		locals,
		platform,
		url: new URL('https://example.test/rsvp/future'),
		params: { eventSlug: 'future' },
		request: new Request('https://example.test/rsvp/future', {
			method: 'POST',
			body: new URLSearchParams({ name: 'Reader', email: 'reader@example.test' })
		})
	});
	assert.equal(response.status, 400);
	assert.equal(await status('reader'), 'cancelled');
	assert.throws(
		() =>
			sqlite.exec(
				"UPDATE session_participants SET attendance_status = 'attending' WHERE id = 'reader'"
			),
		/Departed membership/
	);
	assert.throws(
		() =>
			sqlite.exec(
				"INSERT INTO user_sessions(id,user_id,token_hash,expires_at) VALUES ('stale','reader','hash','2099-10-01')"
			),
		/Departed membership/
	);
	const promoted = await promoteNextWaitlisted(db, 'future');
	assert.equal(promoted.attendee.id, 'other');
});

test('queued email, push and reminder work skip departed accounts at delivery time', async () => {
	const { db, binding } = await fixture();
	await leaveClub(db, 'reader');
	let requests = 0;
	const original = globalThis.fetch;
	globalThis.fetch = async () => {
		requests++;
		return new Response(JSON.stringify({ status: 1 }), { status: 200 });
	};
	try {
		const env = {
			DB: binding,
			PUSHOVER_APP_TOKEN: 'token',
			SEND_EMAILS: true,
			EMAIL: { send: async () => requests++ }
		};
		await handlePushoverNotification(
			{ userId: 'reader', userKey: 'key', title: 'Queued', message: 'Queued' },
			{ env }
		);
		await handlePrivateMessageNotification(
			{
				conversationId: 'conversation',
				messageId: 'queued',
				authorUserId: 'other',
				recipientUserId: 'reader',
				baseUrl: 'https://example.test'
			},
			{ env }
		);
		assert.equal(
			await deliverSessionReminder(binding, 'future', 'reader', async () => {
				requests++;
				return { success: true };
			}),
			'skipped'
		);
		assert.equal(requests, 0);
	} finally {
		globalThis.fetch = original;
	}
});

test('push delivery checks current preferences while preserving an active administrator test', async () => {
	const { db, binding } = await fixture();
	let requests = 0;
	const original = globalThis.fetch;
	globalThis.fetch = async () => {
		requests++;
		return new Response(JSON.stringify({ status: 1 }), { status: 200 });
	};
	try {
		const context = { env: { DB: binding, PUSHOVER_APP_TOKEN: 'token' } };
		const payload = { userId: 'reader', userKey: 'key', title: 'Queued', message: 'Queued' };
		await handlePushoverNotification(payload, context);
		assert.equal(requests, 1);
		await db.update(notificationPreferences).set({ pushoverEnabled: false });
		await handlePushoverNotification(payload, context);
		assert.equal(requests, 1);
		await db.update(users).set({ role: 'admin' }).where(eq(users.id, 'reader'));
		await handlePushoverNotification({ ...payload, eventType: 'pushover_test' }, context);
		assert.equal(requests, 2);
		await leaveClub(db, 'reader');
		await handlePushoverNotification({ ...payload, eventType: 'pushover_test' }, context);
		assert.equal(requests, 2);
	} finally {
		globalThis.fetch = original;
	}
});

test('promotion mail failure preserves a completed departure and the freed place', async () => {
	const { db, action, status, platform } = await fixture();
	platform.env.EMAIL.send = async () => {
		throw new Error('Mailbox unavailable');
	};
	await assert.rejects(action(), (e) => e.status === 303);
	assert.equal(
		(await db.select().from(users).where(eq(users.id, 'reader')).get()).status,
		'suspended'
	);
	assert.equal(await status('guest'), 'attending');
});

test('departure migration preserves existing memberships and records', () => {
	const { sqlite } = database('0040_member_departure.sql');
	sqlite.exec(
		"INSERT INTO users(id,email,display_name) VALUES ('member','member@example.test','Member')"
	);
	sqlite.exec(readFileSync('migrations/0040_member_departure.sql', 'utf8'));
	assert.deepEqual(
		{ ...sqlite.prepare('SELECT status,left_at FROM users').get() },
		{ status: 'active', left_at: null }
	);
});
