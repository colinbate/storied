import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { database } from './database.mjs';
import {
	attendeeIdentities,
	sessionParticipants,
	sessionReminderAttempts,
	sessionReminderDeliveries,
	sessions,
	users
} from '../src/lib/server/db/schema.ts';
import { deliverSessionReminder, REMINDER_LEASE_MS } from '../shared/session-reminder-delivery.ts';
import { runSessionReminders } from '../workers/storied-worker/src/notifications/scheduled-session-reminders.ts';
import {
	actions,
	load as attendeePage
} from '../src/routes/admin/sessions/[slug]/attendees/+page.server.ts';

async function fixture() {
	const context = database();
	const { db, binding } = context;
	// D1 serializes atomic batches. Serialize the asynchronous SQLite test adapter likewise.
	const batch = binding.batch.bind(binding);
	let pending = Promise.resolve();
	binding.batch = (statements) => {
		const result = pending.then(() => batch(statements));
		pending = result.catch(() => {});
		return result;
	};
	await db.insert(users).values([
		{ id: 'host', email: 'host@example.test', displayName: 'Host', role: 'admin' },
		{ id: 'member', email: 'member@example.test', displayName: 'Member', timezone: 'Asia/Tokyo' }
	]);
	await db.insert(sessions).values({
		id: 'meeting',
		slug: 'meeting',
		title: 'Meeting',
		status: 'scheduled',
		startsAt: '2099-10-01T18:00',
		timezone: 'UTC',
		isPublic: true
	});
	await db.insert(attendeeIdentities).values([
		{ id: 'member', userId: 'member', name: 'Member', email: 'member@example.test' },
		{ id: 'guest', name: 'Guest', email: 'guest@example.test' }
	]);
	await db.insert(sessionParticipants).values(
		['member', 'guest'].map((id) => ({
			id,
			sessionId: 'meeting',
			attendeeId: id,
			nameSnapshot: id,
			attendanceStatus: 'attending',
			confirmationToken: `${id}-token`
		}))
	);
	const host = await db.select().from(users).where(eq(users.id, 'host')).get();
	const locals = { db, user: host, permissions: new Set(['sessions:edit', 'sessions:facilitate']) };
	const sent = [];
	const platform = {
		env: { SEND_EMAILS: true, EMAIL: { send: async (email) => sent.push(email) } }
	};
	const deliveries = () => db.select().from(sessionReminderDeliveries).all();
	const attempts = () => db.select().from(sessionReminderAttempts).all();
	const retry = (id, extra = {}) =>
		actions.retryReminder({
			params: { slug: 'meeting' },
			locals,
			platform,
			request: new Request('https://club.example.test/admin/sessions/meeting/attendees', {
				method: 'POST',
				body: new URLSearchParams({ deliveryId: id })
			}),
			...extra
		});
	return { ...context, locals, platform, sent, deliveries, attempts, retry };
}

for (const attendeeId of ['member', 'guest']) {
	test(`facilitator retries a failed ${attendeeId} reminder and retains attempts`, async () => {
		const { binding, deliveries, attempts, retry, sent, locals } = await fixture();
		assert.equal(
			await deliverSessionReminder(binding, 'meeting', attendeeId, async () => ({
				success: false,
				error: 'Mailbox unavailable'
			})),
			'failed'
		);
		const [delivery] = await deliveries();
		const page = await attendeePage({ params: { slug: 'meeting' }, locals });
		assert.deepEqual(page.retryableReminderIds, [delivery.id]);
		assert.equal((await retry(delivery.id)).reminderRetried, true);
		assert.equal(sent.length, 1);
		assert.match(sent[0].text, /\(UTC\)/);
		assert.equal(sent[0].text.includes('Your time:'), attendeeId === 'member');
		const updated = (await deliveries())[0];
		assert.equal(updated.status, 'sent');
		assert.equal(updated.attemptCount, 2);
		assert.deepEqual(
			(await attempts()).map((row) => row.status),
			['failed', 'sent']
		);
		assert.equal((await attempts())[1].requestedByUserId, 'host');
		assert.equal((await retry(delivery.id)).status, 409);
		assert.equal(sent.length, 1);
	});
}

test('overlapping sends and facilitator retries share one active reservation', async () => {
	const { binding, deliveries, attempts, retry, platform, sent } = await fixture();
	let release;
	let entered;
	const started = new Promise((resolve) => {
		entered = resolve;
	});
	const first = deliverSessionReminder(binding, 'meeting', 'guest', async () => {
		entered();
		await new Promise((resolve) => {
			release = resolve;
		});
		return { success: true };
	});
	await started;
	const [delivery] = await deliveries();
	assert.equal((await retry(delivery.id)).status, 409);
	assert.equal(
		await deliverSessionReminder(binding, 'meeting', 'guest', async () => {
			throw new Error('Duplicate send');
		}),
		'skipped'
	);
	release();
	assert.equal(await first, 'sent');
	assert.equal((await attempts()).length, 1);
	assert.equal(sent.length, 0);
	// Two concurrent retries after a real failure still produce one email.
	await deliverSessionReminder(binding, 'meeting', 'member', async () => ({ success: false }));
	const member = (await deliveries()).find((row) => row.attendeeId === 'member');
	let accept;
	let sending;
	const inFlight = new Promise((resolve) => {
		sending = resolve;
	});
	platform.env.EMAIL.send = async (email) => {
		sent.push(email);
		sending();
		await new Promise((resolve) => {
			accept = resolve;
		});
	};
	const retrying = retry(member.id);
	await inFlight;
	assert.equal((await retry(member.id)).status, 409);
	accept();
	assert.equal((await retrying).reminderRetried, true);
	assert.equal(sent.length, 1);
});

test('a paused worker cannot send after another worker recovers its expired reservation', async () => {
	const { binding, deliveries, attempts } = await fixture();
	const now = new Date('2026-10-08T12:00:00Z');
	let resume;
	let claimed;
	const paused = new Promise((resolve) => {
		claimed = resolve;
	});
	let firstBatch = true;
	const stalled = {
		...binding,
		batch: async (statements) => {
			const result = await binding.batch(statements);
			if (firstBatch) {
				firstBatch = false;
				claimed();
				await new Promise((resolve) => {
					resume = resolve;
				});
			}
			return result;
		}
	};
	const original = deliverSessionReminder(
		stalled,
		'meeting',
		'guest',
		async () => {
			throw new Error('Superseded reservation must not send');
		},
		{ now }
	);
	await paused;
	const [delivery] = await deliveries();
	let accepted = 0;
	assert.equal(
		await deliverSessionReminder(
			binding,
			'meeting',
			'guest',
			async () => {
				accepted++;
				return { success: true };
			},
			{ now: new Date(now.getTime() + REMINDER_LEASE_MS), retryDeliveryId: delivery.id }
		),
		'sent'
	);
	resume();
	assert.equal(await original, 'skipped');
	assert.equal(accepted, 1);
	assert.equal((await deliveries())[0].status, 'sent');
	assert.deepEqual(
		(await attempts()).map((row) => row.status),
		['expired', 'sent']
	);
});

test('a provider acceptance followed by a crash remains leased, then an expired retry records recovery', async () => {
	const { binding, deliveries, attempts } = await fixture();
	const now = new Date('2026-10-08T12:00:00Z');
	let batches = 0;
	const crashing = {
		...binding,
		batch: async (statements) => {
			if (++batches === 2) throw new Error('Worker stopped before recording result');
			return binding.batch(statements);
		}
	};
	let accepted = 0;
	await assert.rejects(
		deliverSessionReminder(
			crashing,
			'meeting',
			'guest',
			async () => {
				accepted++;
				return { success: true };
			},
			{ now }
		),
		/Worker stopped/
	);
	const [delivery] = await deliveries();
	assert.equal(delivery.status, 'sending');
	assert.equal(
		await deliverSessionReminder(
			binding,
			'meeting',
			'guest',
			async () => {
				throw new Error('Live lease');
			},
			{ now, retryDeliveryId: delivery.id }
		),
		'skipped'
	);
	assert.equal(
		await deliverSessionReminder(
			binding,
			'meeting',
			'guest',
			async () => {
				accepted++;
				return { success: true };
			},
			{
				now: new Date(now.getTime() + REMINDER_LEASE_MS),
				retryDeliveryId: delivery.id,
				requestedByUserId: 'host'
			}
		),
		'sent'
	);
	assert.equal(accepted, 2);
	assert.deepEqual(
		(await attempts()).map((row) => row.status),
		['expired', 'sent']
	);
	assert.equal((await deliveries())[0].attemptCount, 2);
});

test('a late failed callback cannot overwrite the recovered successful attempt', async () => {
	const { binding, deliveries, attempts } = await fixture();
	const now = new Date('2026-10-08T12:00:00Z');
	let finish;
	let enter;
	const started = new Promise((resolve) => {
		enter = resolve;
	});
	const original = deliverSessionReminder(
		binding,
		'meeting',
		'guest',
		async () => {
			enter();
			await new Promise((resolve) => {
				finish = resolve;
			});
			return { success: false, error: 'Late failure' };
		},
		{ now }
	);
	await started;
	const [delivery] = await deliveries();
	assert.equal(
		await deliverSessionReminder(binding, 'meeting', 'guest', async () => ({ success: true }), {
			now: new Date(now.getTime() + REMINDER_LEASE_MS + 1),
			retryDeliveryId: delivery.id
		}),
		'sent'
	);
	finish();
	await original;
	assert.equal((await deliveries())[0].status, 'sent');
	assert.equal((await deliveries())[0].failureReason, null);
	assert.deepEqual(
		(await attempts()).map((row) => row.status),
		['expired', 'sent']
	);
});

test('rescheduling creates a fresh revision, prevents old retries, and preserves successful history', async () => {
	const { db, binding, deliveries, attempts, retry, locals } = await fixture();
	await deliverSessionReminder(binding, 'meeting', 'guest', async () => ({ success: true }));
	const [original] = await deliveries();
	await db.update(sessions).set({ startsAt: '2099-10-02T18:00' }).where(eq(sessions.id, 'meeting'));
	assert.equal((await db.select().from(sessions).get()).reminderRevision, 2);
	assert.equal((await retry(original.id)).status, 409);
	let sent = 0;
	assert.equal(
		await deliverSessionReminder(binding, 'meeting', 'guest', async () => {
			sent++;
			return { success: true };
		}),
		'sent'
	);
	assert.equal(
		await deliverSessionReminder(binding, 'meeting', 'guest', async () => {
			throw new Error('Duplicate revision');
		}),
		'skipped'
	);
	assert.equal(sent, 1);
	assert.deepEqual(
		(await deliveries()).map((row) => row.scheduleRevision),
		[1, 2]
	);
	const page = await attendeePage({ params: { slug: 'meeting' }, locals });
	assert.equal(page.reminderDeliveries.guest.scheduleRevision, 2);
	assert.equal(page.reminderHistory.guest.length, 2);
	await db.update(sessions).set({ timezone: 'Atlantic/Bermuda' }).where(eq(sessions.id, 'meeting'));
	assert.equal((await db.select().from(sessions).get()).reminderRevision, 3);
	await db
		.update(sessions)
		.set({ title: 'Renamed', timezone: 'Atlantic/Bermuda' })
		.where(eq(sessions.id, 'meeting'));
	assert.equal((await db.select().from(sessions).get()).reminderRevision, 3);
	assert.equal((await attempts()).length, 2);
});

for (const [name, change] of [
	['cancelled meeting', async (db) => db.update(sessions).set({ status: 'cancelled' })],
	['draft meeting', async (db) => db.update(sessions).set({ status: 'draft' })],
	[
		'running meeting',
		async (db) => db.update(sessions).set({ liveStartedAt: new Date().toISOString() })
	],
	[
		'ended meeting',
		async (db) => db.update(sessions).set({ liveEndedAt: new Date().toISOString() })
	],
	['elapsed meeting', async (db) => db.update(sessions).set({ startsAt: '2000-01-01T18:00' })],
	[
		'cancelled RSVP',
		async (db) => db.update(sessionParticipants).set({ attendanceStatus: 'cancelled' })
	],
	[
		'waitlisted RSVP',
		async (db) => db.update(sessionParticipants).set({ attendanceStatus: 'waitlisted' })
	],
	['removed RSVP', async (db) => db.delete(sessionParticipants)],
	['removed email', async (db) => db.update(attendeeIdentities).set({ email: null })],
	[
		'suspended member',
		async (db) => db.update(users).set({ status: 'suspended' }).where(eq(users.id, 'member'))
	]
]) {
	test(`retry skips a ${name}`, async () => {
		const { db, binding, deliveries, retry, sent } = await fixture();
		await deliverSessionReminder(binding, 'meeting', 'member', async () => ({ success: false }));
		const [delivery] = await deliveries();
		await change(db);
		assert.equal((await retry(delivery.id)).status, 409);
		assert.equal(sent.length, 0);
		assert.equal((await deliveries())[0].attemptCount, 1);
	});
}

test('retry enforces permissions, delivery ownership, and availability', async () => {
	const { db, binding, deliveries, retry, locals } = await fixture();
	await deliverSessionReminder(binding, 'meeting', 'guest', async () => ({ success: false }));
	const [delivery] = await deliveries();
	await assert.rejects(
		retry(delivery.id, { locals: { ...locals, permissions: new Set(['sessions:edit']) } }),
		(error) => error.status === 403
	);
	await db.insert(sessions).values({ id: 'other', slug: 'other', title: 'Other' });
	assert.equal((await retry(delivery.id, { params: { slug: 'other' } })).status, 404);
	assert.equal((await retry(delivery.id, { platform: undefined })).status, 503);
	assert.equal((await deliveries())[0].attemptCount, 1);
});

test('scheduled runs recover failures and send rescheduled revisions only on the new event-local reminder day', async () => {
	const { db, binding, platform, sent, deliveries } = await fixture();
	const now = new Date('2099-09-30T12:00:00Z');
	let fail = true;
	const send = platform.env.EMAIL.send;
	platform.env.EMAIL.send = async (email) => {
		if (fail) throw new Error('Email unavailable');
		await send(email);
	};
	const context = { env: { ...platform.env, DB: binding } };
	await runSessionReminders(context, now);
	assert.deepEqual(
		(await deliveries()).map((row) => row.status),
		['failed', 'failed']
	);
	fail = false;
	await runSessionReminders(context, now);
	await runSessionReminders(context, now);
	assert.equal(sent.length, 2);
	await db.update(sessions).set({ startsAt: '2099-10-03T18:00' });
	await runSessionReminders(context, now);
	assert.equal(sent.length, 2);
	await runSessionReminders(context, new Date('2099-10-02T12:00:00Z'));
	assert.equal(sent.length, 4);
	assert.equal((await deliveries()).length, 4);
});

test('eligibility changes after a claim are recorded without sending', async () => {
	const { sqlite, binding, deliveries, attempts } = await fixture();
	let first = true;
	const changing = {
		...binding,
		batch: async (statements) => {
			const result = await binding.batch(statements);
			if (first) {
				first = false;
				sqlite.exec(
					"UPDATE session_participants SET attendance_status = 'declined' WHERE id = 'guest'"
				);
			}
			return result;
		}
	};
	assert.equal(
		await deliverSessionReminder(changing, 'meeting', 'guest', async () => {
			throw new Error('Ineligible send');
		}),
		'skipped'
	);
	assert.equal((await deliveries())[0].status, 'failed');
	assert.equal((await attempts())[0].status, 'skipped');
});

test('migration preserves legacy outcomes and makes interrupted reservations recoverable', () => {
	const { sqlite } = database('0038_session_reminder_recovery.sql');
	sqlite.exec(
		"INSERT INTO sessions (id, slug, title, starts_at) VALUES ('meeting', 'meeting', 'Meeting', '2099-10-01T18:00')"
	);
	for (const status of ['sent', 'failed', 'sending']) {
		sqlite
			.prepare(
				"INSERT INTO session_reminder_deliveries (id, session_id, attendee_id, participant_id, recipient_email, status, attempted_at) VALUES (?, 'meeting', ?, ?, 'guest@example.test', ?, '2026-10-08T12:00:00.000Z')"
			)
			.run(status, status, status, status);
	}
	sqlite.exec(readFileSync('migrations/0038_session_reminder_recovery.sql', 'utf8'));
	const rows = sqlite.prepare('SELECT * FROM session_reminder_deliveries ORDER BY id').all();
	assert.equal(rows.length, 3);
	assert.ok(rows.every((row) => row.schedule_revision === 1 && row.attempt_count === 1));
	assert.equal(
		rows.find((row) => row.status === 'sending').lease_expires_at,
		'2026-10-08T12:10:00.000Z'
	);
	assert.equal(sqlite.prepare('SELECT count(*) AS n FROM session_reminder_attempts').get().n, 3);
	sqlite.exec("UPDATE sessions SET starts_at = '2099-10-02T18:00' WHERE id = 'meeting'");
	assert.equal(sqlite.prepare('SELECT reminder_revision FROM sessions').get().reminder_revision, 2);
});
