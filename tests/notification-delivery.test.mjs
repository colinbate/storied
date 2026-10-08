import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { database } from './database.mjs';
import {
	users,
	categories,
	threads,
	posts,
	notificationPreferences,
	conversations,
	conversationMembers,
	privateMessages,
	notificationEvents,
	postReactions,
	subscriptions,
	groups,
	groupMemberships
} from '../src/lib/server/db/schema.ts';
import { handleReactionNotification } from '../workers/storied-worker/src/notifications/queue-reaction.ts';
import { handlePrivateMessageNotification } from '../workers/storied-worker/src/notifications/queue-private-message.ts';
import { runDailyDigest } from '../workers/storied-worker/src/notifications/scheduled-digest.ts';
import { loadPersonalDigestActivity } from '../workers/storied-worker/src/notifications/digest-personal-activity.ts';
import { actions } from '../src/routes/settings/+page.server.ts';

const now = Date.parse('2026-10-08T12:00:00.000Z');
const stamp = new Date(now).toISOString();
const before = new Date(now - 3 * 86400_000).toISOString();
async function fixture(mode = 'daily_digest', push = false) {
	const context = database();
	const { db } = context;
	await db.insert(users).values(
		['reader', 'ada', 'grace'].map((id) => ({
			id,
			email: `${id}@example.test`,
			displayName: id === 'ada' ? '<Ada>' : id,
			timezone: 'UTC',
			lastLoginAt: before
		}))
	);
	await db.insert(notificationPreferences).values({
		userId: 'reader',
		emailEnabled: mode !== 'off',
		digestHourLocal: mode === 'daily_digest' ? 12 : null,
		defaultSubMode: mode === 'daily_digest' ? 'daily_digest' : 'immediate',
		pushoverEnabled: push,
		pushoverUserKey: push ? 'key' : null
	});
	await db.insert(categories).values({ id: 'category', slug: 'delivery-general', name: 'General' });
	await db.insert(threads).values({
		id: 'thread',
		categoryId: 'category',
		authorUserId: 'reader',
		title: '<Meeting>',
		slug: 'meeting',
		bodySource: 'Opening',
		bodyHtml: '<p>Opening</p>',
		createdAt: before
	});
	await db.insert(posts).values({
		id: 'reply',
		threadId: 'thread',
		authorUserId: 'reader',
		bodySource: 'Reply',
		bodyHtml: '<p>Reply</p>',
		createdAt: before
	});
	await db.insert(conversations).values({ id: 'conversation', createdByUserId: 'ada' });
	await db
		.insert(conversationMembers)
		.values(['reader', 'ada'].map((userId) => ({ conversationId: 'conversation', userId })));
	await db.insert(privateMessages).values({
		id: 'message',
		conversationId: 'conversation',
		authorUserId: 'ada',
		bodySource: 'Hello ||the ending|| <script>',
		bodyHtml: '<p>Hello</p>',
		createdAt: new Date(now - 120_000).toISOString()
	});
	await db.insert(postReactions).values(
		['ada', 'grace'].map((userId, i) => ({
			id: `reaction-${i}`,
			threadId: 'thread',
			postId: 'reply',
			targetKey: 'post:reply',
			userId,
			emoji: '👍',
			createdAt: new Date(now - 60_000).toISOString()
		}))
	);
	const sent = [],
		pushes = [],
		queued = [];
	const env = {
		DB: context.binding,
		SEND_EMAILS: 'yes',
		DIGEST_BASE_URL: 'https://example.test',
		EMAIL: {
			async send(message) {
				sent.push(message);
			}
		},
		WORKER_QUEUE: {
			async send(message, options) {
				queued.push({ message, options });
			}
		},
		PUSHOVER_QUEUE: {
			async send(message) {
				pushes.push(message);
			}
		}
	};
	return { ...context, env, sent, pushes, queued };
}
const reaction = (env) =>
	handleReactionNotification(
		{ threadId: 'thread', postId: 'reply', baseUrl: 'https://example.test' },
		{ env },
		now
	);
const message = (env) =>
	handlePrivateMessageNotification(
		{
			conversationId: 'conversation',
			messageId: 'message',
			authorUserId: 'ada',
			recipientUserId: 'reader',
			baseUrl: 'https://example.test'
		},
		{ env },
		now
	);
const digest = (env, elapsed = 60_000) => runDailyDigest({ env }, new Date(now + elapsed));
const pending = (sqlite) =>
	sqlite
		.prepare(
			"SELECT id FROM notification_events WHERE status = 'pending' AND json_extract(payload_json, '$.deliveryMode') = 'daily_digest'"
		)
		.all();

test('daily mode defers and groups messages and reactions into one digest, keeping push independent', async () => {
	const { db, env, sqlite, sent, pushes } = await fixture('daily_digest', true);
	await Promise.all([reaction(env), message(env), message(env)]);
	assert.equal(sent.length, 0);
	assert.equal(pushes.length, 1);
	assert.equal(pending(sqlite).length, 2);
	await db.insert(privateMessages).values({
		id: 'message-2',
		conversationId: 'conversation',
		authorUserId: 'ada',
		bodySource: 'Newest message',
		bodyHtml: '<p>Newest</p>',
		createdAt: stamp
	});
	await handlePrivateMessageNotification(
		{
			conversationId: 'conversation',
			messageId: 'message-2',
			authorUserId: 'ada',
			recipientUserId: 'reader',
			baseUrl: 'https://example.test'
		},
		{ env },
		now
	);
	await Promise.all([digest(env), digest(env), digest(env)]);
	assert.equal(sent.length, 1);
	assert.match(sent[0].text, /ada, grace reacted|<Ada>, grace reacted/);
	assert.match(sent[0].text, /👍 2/);
	assert.match(sent[0].text, /2 unread private messages/);
	assert.match(sent[0].text, /Newest message/);
	assert.match(sent[0].text, /\?post=reply#post-reply/);
	assert.match(sent[0].text, /\/messages\/conversation/);
	assert.match(sent[0].html, /&lt;Meeting&gt;/);
	assert.match(sent[0].html, /&lt;Ada&gt;/);
	assert.equal(pending(sqlite).length, 0);
	await digest(env, 2 * 60_000);
	await reaction(env);
	await message(env);
	assert.equal(sent.length, 1);
});

test('immediate mode sends each email once across queue retries and concurrent messages', async () => {
	const { env, sent, sqlite } = await fixture('immediate');
	await Promise.all([message(env), message(env), message(env), reaction(env)]);
	await message(env);
	await reaction(env);
	await digest(env);
	assert.equal(sent.length, 2);
	assert.equal(pending(sqlite).length, 0);
	assert.doesNotMatch(
		sent.find((email) => /private message/.test(email.subject)).text,
		/the ending/
	);
});

test('off suppresses emails and deferred events while reaction push still works', async () => {
	const { env, sent, pushes, sqlite } = await fixture('off', true);
	await reaction(env);
	await message(env);
	await digest(env);
	assert.equal(sent.length, 0);
	assert.equal(pushes.length, 1);
	assert.equal(pending(sqlite).length, 0);
});

test('a failed digest retains its window and events for a successful retry', async () => {
	const { env, sqlite, sent } = await fixture();
	await reaction(env);
	await message(env);
	const deliver = env.EMAIL.send;
	env.EMAIL.send = async () => {
		throw new Error('Mail unavailable');
	};
	await digest(env);
	assert.equal(pending(sqlite).length, 2);
	assert.equal(
		sqlite.prepare('SELECT last_digest_at FROM notification_preferences').get().last_digest_at,
		null
	);
	env.EMAIL.send = deliver;
	await digest(env, 120_000);
	assert.equal(sent.length, 1);
	assert.equal(pending(sqlite).length, 0);
	await digest(env, 180_000);
	assert.equal(sent.length, 1);
});

test('failed immediate message follows a newly selected digest preference on retry', async () => {
	const { env, db, sent, sqlite } = await fixture('immediate');
	const deliver = env.EMAIL.send;
	env.EMAIL.send = async () => {
		throw new Error('Mail unavailable');
	};
	await assert.rejects(message(env), /Mail unavailable/);
	await db
		.update(notificationPreferences)
		.set({ digestHourLocal: 12 })
		.where(eq(notificationPreferences.userId, 'reader'));
	env.EMAIL.send = deliver;
	await message(env);
	assert.equal(sent.length, 0);
	assert.equal(pending(sqlite).length, 1);
	await digest(env);
	assert.equal(sent.length, 1);
});

test('digest filters newly muted conversations and threads, read messages and removed reactions', async () => {
	for (const mutate of [
		async (db) => {
			await db
				.update(conversationMembers)
				.set({ mutedAt: stamp })
				.where(eq(conversationMembers.userId, 'reader'));
			await db
				.insert(subscriptions)
				.values({ id: 'mute', userId: 'reader', threadId: 'thread', mode: 'mute' });
		},
		async (db) => {
			await db
				.update(conversationMembers)
				.set({ lastReadAt: stamp })
				.where(eq(conversationMembers.userId, 'reader'));
			await db.delete(postReactions);
		},
		async (db) => {
			await db.delete(conversationMembers).where(eq(conversationMembers.userId, 'reader'));
			await db.update(posts).set({ deletedAt: stamp });
		}
	]) {
		const { env, db, sent, sqlite } = await fixture();
		await reaction(env);
		await message(env);
		await mutate(db);
		await digest(env);
		assert.equal(sent.length, 0);
		assert.equal(pending(sqlite).length, 0);
	}
});

test('lost group access and suspended accounts do not receive deferred content', async () => {
	const { env, db, sent, sqlite } = await fixture();
	await db
		.insert(groups)
		.values({ id: 'group', name: 'Circle', slug: 'circle', createdByUserId: 'ada' });
	await db.insert(groupMemberships).values({ groupId: 'group', userId: 'reader' });
	await db.update(threads).set({ audienceGroupId: 'group' });
	await reaction(env);
	await db.delete(groupMemberships);
	await digest(env);
	assert.equal(sent.length, 0);
	assert.equal(pending(sqlite).length, 0);
	const second = await fixture();
	await message(second.env);
	await second.db.update(users).set({ status: 'suspended' }).where(eq(users.id, 'reader'));
	await digest(second.env);
	assert.equal(second.sent.length, 0);
});

test('changing settings to off or immediate cancels the old digest backlog', async () => {
	for (const mode of ['off', 'immediate']) {
		const { env, db, sqlite, sent } = await fixture();
		await reaction(env);
		await message(env);
		const form = new FormData();
		form.set('mode', mode);
		assert.deepEqual(
			await actions.updatePreferences({
				locals: { db, user: { id: 'reader' } },
				request: {
					async formData() {
						return form;
					}
				}
			}),
			{ prefsSuccess: true }
		);
		assert.equal(pending(sqlite).length, 0);
		await db.update(notificationPreferences).set({ emailEnabled: true, digestHourLocal: 12 });
		await digest(env);
		assert.equal(sent.length, 0);
	}
});

test('deferred events survive a failed send beyond the forum window and use current spoiler-safe content', async () => {
	const { env, sent } = await fixture();
	await message(env);
	const content = await loadPersonalDigestActivity(
		env,
		'reader',
		new Date(now + 4 * 86400_000).toISOString()
	);
	assert.equal(content.activity.length, 1);
	assert.doesNotMatch(content.activity[0].bodyPreview, /the ending/);
	await digest(env, 4 * 86400_000 + 60_000);
	assert.equal(sent.length, 1);
	assert.doesNotMatch(sent[0].text, /the ending/);
	assert.doesNotMatch(sent[0].html, /<script>/);
});

test('midnight digest mode is deferred and uses the member timezone', async () => {
	const { db, env, sent } = await fixture();
	await db.update(notificationPreferences).set({ digestHourLocal: 0 });
	await db.update(users).set({ timezone: 'Pacific/Auckland' }).where(eq(users.id, 'reader'));
	await message(env);
	assert.equal(sent.length, 0);
	await digest(env);
	assert.equal(sent.length, 0);
	await runDailyDigest({ env }, new Date('2026-10-09T11:05:00.000Z'));
	assert.equal(sent.length, 1);
});

test('an interrupted immediate send is requeued until its lease expires', async () => {
	const { db, env, sent, queued } = await fixture('immediate');
	await db.insert(notificationEvents).values({
		id: 'private-message:message:reader',
		userId: 'reader',
		eventType: 'private_message',
		status: 'pending',
		availableAt: new Date(now + 600_000).toISOString(),
		payloadJson: JSON.stringify({
			conversationId: 'conversation',
			messageId: 'message',
			authorUserId: 'ada',
			deliveryMode: 'immediate'
		})
	});
	await message(env);
	assert.equal(sent.length, 0);
	assert.equal(queued[0].options.delaySeconds, 600);
	await handlePrivateMessageNotification(queued[0].message.payload, { env }, now + 600_000);
	assert.equal(sent.length, 1);
});

test('deferred reaction emails remain independent of a failing push queue and its retries', async () => {
	const { env, sqlite, sent, pushes } = await fixture('daily_digest', true);
	const deliver = env.PUSHOVER_QUEUE.send;
	env.PUSHOVER_QUEUE.send = async () => {
		throw new Error('Push unavailable');
	};
	await assert.rejects(reaction(env), /Push unavailable/);
	assert.equal(pending(sqlite).length, 1);
	await digest(env);
	assert.equal(sent.length, 1);
	env.PUSHOVER_QUEUE.send = deliver;
	await reaction(env);
	await reaction(env);
	assert.equal(pushes.length, 1);
	assert.equal(pending(sqlite).length, 0);
	assert.equal(sent.length, 1);
});

test('daily reaction batches keep the ten-minute throttle and aggregate per post in the digest', async () => {
	const { db, env, sent, sqlite, queued } = await fixture();
	await reaction(env);
	await db.insert(postReactions).values({
		id: 'heart',
		threadId: 'thread',
		postId: 'reply',
		targetKey: 'post:reply',
		userId: 'ada',
		emoji: '❤️',
		createdAt: new Date(now + 30_000).toISOString()
	});
	const payload = { threadId: 'thread', postId: 'reply', baseUrl: 'https://example.test' };
	await handleReactionNotification(payload, { env }, now + 90_000);
	assert.equal(queued.at(-1).options.delaySeconds, 510);
	assert.equal(pending(sqlite).length, 1);
	await handleReactionNotification(payload, { env }, now + 600_000);
	assert.equal(pending(sqlite).length, 2);
	assert.equal(sent.length, 0);
	await digest(env, 660_000);
	assert.equal(sent.length, 1);
	assert.match(sent[0].text, /👍 2/);
	assert.match(sent[0].text, /❤️ 1/);
	assert.equal((sent[0].text.match(/reacted to your post/g) ?? []).length, 1);
});
