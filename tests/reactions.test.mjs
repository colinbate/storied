import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { database } from './database.mjs';
import {
	users,
	categories,
	threads,
	posts,
	postReactions,
	notificationPreferences,
	subscriptions
} from '../src/lib/server/db/schema.ts';
import { EMOJIS } from '../shared/emoji-data.ts';
import { loadReactions, normalizeReactionEmoji, setReaction } from '../src/lib/server/reactions.ts';
import { createThreadActions } from '../src/lib/server/thread-view.ts';
import { handleReactionNotification } from '../workers/storied-worker/src/notifications/queue-reaction.ts';
import { renderReactionNotificationEmail } from '../workers/storied-worker/src/notifications/email.ts';

const start = Date.parse('2026-10-07T12:00:00.000Z');
async function fixture() {
	const context = database();
	const { db } = context;
	await db.insert(users).values(
		['author', 'reader', 'other'].map((id) => ({
			id,
			email: `${id}@example.test`,
			displayName: id,
			lastLoginAt: new Date(start).toISOString()
		}))
	);
	await db.insert(categories).values({ id: 'category', slug: 'reaction-general', name: 'General' });
	await db.insert(threads).values({
		id: 'thread',
		categoryId: 'category',
		authorUserId: 'author',
		title: 'A discussion',
		slug: 'discussion',
		bodySource: 'Opening',
		bodyHtml: '<p>Opening</p>'
	});
	await db.insert(posts).values({
		id: 'reply',
		threadId: 'thread',
		authorUserId: 'author',
		bodySource: 'Reply',
		bodyHtml: '<p>Reply</p>'
	});
	const sent = [],
		queued = [];
	const env = {
		DB: context.binding,
		SEND_EMAILS: 'yes',
		EMAIL: {
			async send(message) {
				sent.push(message);
			}
		},
		WORKER_QUEUE: {
			async send(message, options) {
				queued.push({ message, options });
			}
		}
	};
	return { ...context, sent, queued, env };
}
function reaction(db, emoji, userId = 'reader', postId = null, remove = false) {
	return setReaction({ db, emoji, userId, postId, remove, threadId: 'thread' });
}
async function addAt(db, emoji, elapsed = 0, userId = 'reader', postId = null) {
	await db.insert(postReactions).values({
		id: `${userId}:${emoji}:${elapsed}:${postId}`,
		threadId: 'thread',
		postId,
		targetKey: postId ? `post:${postId}` : 'thread:thread',
		userId,
		emoji,
		createdAt: new Date(start + elapsed).toISOString()
	});
}
function notify(env, elapsed = 60_000, postId = null) {
	return handleReactionNotification(
		{ threadId: 'thread', postId, baseUrl: 'https://example.test' },
		{ env },
		start + elapsed
	);
}

test('people can react with multiple emojis, aggregate counts, and remove independently on opener and replies', async () => {
	const { db } = await fixture();
	await reaction(db, '👍');
	await reaction(db, '❤️');
	await reaction(db, '👍', 'other');
	await reaction(db, '👍', 'reader', 'reply');
	assert.deepEqual(await reaction(db, '👍'), { added: false, atLimit: false });
	let result = await loadReactions(db, ['thread:thread', 'post:reply'], 'reader');
	assert.equal(result['thread:thread'].find((r) => r.emoji === '👍').count, 2);
	assert.equal(result['thread:thread'].find((r) => r.emoji === '❤️').reacted, true);
	assert.equal(result['post:reply'][0].count, 1);
	await reaction(db, '👍', 'reader', null, true);
	result = await loadReactions(db, ['thread:thread'], 'reader');
	assert.equal(result['thread:thread'].find((r) => r.emoji === '👍').count, 1);
	assert.equal(result['thread:thread'].find((r) => r.emoji === '👍').reacted, false);
});

test('20 distinct emoji limit still allows sharing, removal and reuse of a freed slot', async () => {
	const { db } = await fixture();
	for (const { emoji } of EMOJIS.slice(0, 20)) await reaction(db, emoji);
	assert.equal((await reaction(db, EMOJIS[20].emoji)).atLimit, true);
	assert.equal((await reaction(db, EMOJIS[0].emoji, 'other')).added, true);
	await reaction(db, EMOJIS[1].emoji, 'reader', null, true);
	assert.equal((await reaction(db, EMOJIS[20].emoji)).added, true);
	assert.equal((await reaction(db, EMOJIS[21].emoji, 'reader', 'reply')).added, true);
});

test('emoji validation handles selectors, sequences and skin tones and rejects arbitrary input', () => {
	assert.equal(normalizeReactionEmoji('❤'), '❤️');
	assert.equal(normalizeReactionEmoji('👍🏽'), '👍🏽');
	assert.equal(normalizeReactionEmoji('👨‍👩‍👧‍👦'), '👨‍👩‍👧‍👦');
	for (const invalid of ['hello', '👍❤️', '🏽', '<script>', ''])
		assert.equal(normalizeReactionEmoji(invalid), null);
});

test('reaction actions enforce authentication, resolved visibility, locking and reply ownership', async () => {
	const { db } = await fixture();
	let thread = await db.select().from(threads).get();
	const actions = createThreadActions({
		resolveThread: async () => thread,
		afterDelete: () => '/'
	});
	const event = (fields, user = { id: 'reader' }) => ({
		locals: { db, user },
		request: {
			async formData() {
				const form = new FormData();
				for (const [key, value] of Object.entries(fields)) form.set(key, value);
				return form;
			}
		},
		url: new URL('https://example.test/thread/discussion')
	});
	await assert.rejects(
		actions.setReaction(event({ emoji: '👍', mode: 'add' }, null)),
		(error) => error.status === 302
	);
	thread = { ...thread, isLocked: true };
	assert.equal((await actions.setReaction(event({ emoji: '👍', mode: 'add' }))).status, 403);
	thread = { ...thread, isLocked: false };
	assert.equal(
		(await actions.setReaction(event({ emoji: '👍', mode: 'add', postId: 'missing' }))).status,
		404
	);
	assert.equal((await actions.setReaction(event({ emoji: 'plain', mode: 'add' }))).status, 400);
	await db.update(posts).set({ deletedAt: new Date().toISOString() }).where(eq(posts.id, 'reply'));
	assert.equal(
		(await actions.setReaction(event({ emoji: '👍', mode: 'add', postId: 'reply' }))).status,
		404
	);
	thread = undefined;
	await assert.rejects(
		actions.setReaction(event({ emoji: '👍', mode: 'add' })),
		(error) => error.status === 404
	);
});

test('database rejects reactions on replies from another thread and cascades deleted targets', async () => {
	const { db } = await fixture();
	await assert.rejects(
		db.insert(postReactions).values({
			id: 'bad',
			targetKey: 'post:reply',
			threadId: 'other-thread',
			postId: 'reply',
			userId: 'reader',
			emoji: '👍'
		})
	);
	await reaction(db, '👍', 'reader', 'reply');
	await db.delete(posts).where(eq(posts.id, 'reply'));
	assert.equal((await db.select().from(postReactions)).length, 0);
});

test('notifications collect the first minute and throttle one batch per post for ten minutes', async () => {
	const { db, env, sent, queued } = await fixture();
	await addAt(db, '👍');
	await addAt(db, '❤️', 20_000);
	await addAt(db, '👍', 30_000, 'other');
	await notify(env, 30_000);
	assert.equal(sent.length, 0);
	assert.equal(queued[0].options.delaySeconds, 30);
	await notify(env);
	await notify(env);
	assert.equal(sent.length, 1);
	assert.match(sent[0].text, /👍 2/);
	assert.match(sent[0].text, /❤️ 1/);
	assert.match(sent[0].text, /reader, other/);
	await addAt(db, '🎉', 90_000);
	await notify(env, 150_000);
	assert.equal(sent.length, 1);
	assert.equal(queued.at(-1).options.delaySeconds, 510);
	await notify(env, 660_000);
	await notify(env, 660_000);
	assert.equal(sent.length, 2);
	assert.match(sent[1].text, /🎉 1/);
	assert.doesNotMatch(sent[1].text, /👍/);
	await addAt(db, '👍', 670_000, 'reader', 'reply');
	await notify(env, 730_000, 'reply');
	assert.equal(sent.length, 3);
	assert.match(sent[2].text, /\?post=reply#post-reply/);
});

test('self reactions and removed reactions do not notify', async () => {
	const { db, env, sent } = await fixture();
	await addAt(db, '👍', 0, 'author');
	await addAt(db, '❤️');
	await reaction(db, '❤️', 'reader', null, true);
	await notify(env);
	assert.equal(sent.length, 0);
});

test('notifications honor email preferences, mute, deleted posts and current thread access', async () => {
	for (const change of [
		async (db) =>
			db.insert(notificationPreferences).values({ userId: 'author', emailEnabled: false }),
		async (db) =>
			db
				.insert(subscriptions)
				.values({ id: 'mute', userId: 'author', threadId: 'thread', mode: 'mute' }),
		async (db) => db.update(threads).set({ deletedAt: new Date().toISOString() }),
		async (db) => db.update(threads).set({ visibility: 'admins' }),
		async (db) => db.update(users).set({ status: 'suspended' }).where(eq(users.id, 'author'))
	]) {
		const { db, env, sent } = await fixture();
		await addAt(db, '👍');
		await change(db);
		await notify(env);
		assert.equal(sent.length, 0);
	}
});

test('failed email releases the claim for retry and records delivery status', async () => {
	const { db, env, sent, sqlite } = await fixture();
	await addAt(db, '👍');
	const deliver = env.EMAIL.send;
	env.EMAIL.send = async () => {
		throw new Error('Temporary failure');
	};
	await assert.rejects(notify(env), /Temporary failure/);
	assert.equal(sqlite.prepare('SELECT status FROM notification_events').get().status, 'failed');
	env.EMAIL.send = deliver;
	await notify(env);
	assert.equal(sent.length, 1);
	assert.equal(
		sqlite.prepare("SELECT count(*) AS count FROM notification_events WHERE status = 'sent'").get()
			.count,
		1
	);
});

test('reaction email escapes member names and thread titles', () => {
	const result = renderReactionNotificationEmail({
		threadTitle: '<script>',
		actors: '<img>',
		summary: '❤️ 2',
		postUrl: 'https://example.test/?a=1&b=2'
	});
	assert.doesNotMatch(result.htmlBody, /<script>|<img>/);
	assert.match(result.htmlBody, /&lt;script&gt;/);
});

test('simultaneous notification messages deliver one batch', async () => {
	const { db, env, sent } = await fixture();
	await addAt(db, '👍');
	await Promise.all([notify(env), notify(env), notify(env)]);
	assert.equal(sent.length, 1);
});

test('Pushover can notify with email disabled and shares the throttle', async () => {
	const { db, env, sent } = await fixture();
	const pushes = [];
	env.PUSHOVER_QUEUE = {
		async send(message) {
			pushes.push(message);
		}
	};
	await db.insert(notificationPreferences).values({
		userId: 'author',
		emailEnabled: false,
		pushoverEnabled: true,
		pushoverUserKey: 'key'
	});
	await addAt(db, '👍');
	await notify(env);
	await notify(env);
	assert.equal(sent.length, 0);
	assert.equal(pushes.length, 1);
	assert.equal(pushes[0].payload.eventType, 'reaction');
});

test('push retry preserves a sent email and leaves later reactions for the next batch', async () => {
	const { db, env, sent } = await fixture();
	const pushes = [];
	let failPush = true;
	env.PUSHOVER_QUEUE = {
		async send(message) {
			if (failPush) throw new Error('Queue unavailable');
			pushes.push(message);
		}
	};
	await db
		.insert(notificationPreferences)
		.values({ userId: 'author', pushoverEnabled: true, pushoverUserKey: 'key' });
	await addAt(db, '👍');
	await assert.rejects(notify(env), /Queue unavailable/);
	assert.equal(sent.length, 1);
	await addAt(db, '❤️', 90_000);
	failPush = false;
	await notify(env, 120_000);
	assert.equal(sent.length, 1);
	assert.equal(pushes.length, 1);
	assert.doesNotMatch(pushes[0].payload.message, /❤️/);
	await notify(env, 720_000);
	assert.equal(sent.length, 2);
	assert.match(sent[1].text, /❤️/);
});
