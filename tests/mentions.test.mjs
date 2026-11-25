import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { database } from './database.mjs';
import {
	categories,
	groups,
	groupMemberships,
	notificationPreferences,
	posts,
	subscriptions,
	threads,
	users
} from '../src/lib/server/db/schema.ts';
import { actions } from '../src/routes/new/+page.server.ts';
import { handleNewThreadFanout } from '../workers/storied-worker/src/notifications/queue-new-thread-fanout.ts';
import { handleThreadReplyFanout } from '../workers/storied-worker/src/notifications/queue-thread-reply-fanout.ts';

async function fixture() {
	const context = database();
	const { db } = context;
	await db.insert(users).values(
		['author', 'reader', 'watcher'].map((id) => ({
			id,
			email: `${id}@example.test`,
			displayName: id === 'reader' ? 'Ada Reader' : id,
			lastLoginAt: '2026-11-01T12:00:00.000Z'
		}))
	);
	await db.insert(categories).values({ id: 'category', slug: 'mentions', name: 'General' });
	await db.insert(threads).values({
		id: 'thread',
		categoryId: 'category',
		authorUserId: 'author',
		title: 'A discussion',
		slug: 'a-discussion',
		bodySource: 'Hello @Ada Reader, @reader@example.test and @author. ||Secret ending||',
		bodyHtml: '<p>Hello</p>'
	});
	await db.insert(posts).values({
		id: 'reply',
		threadId: 'thread',
		authorUserId: 'author',
		bodySource: 'Hello @Ada Reader. ||Secret ending||',
		bodyHtml: '<p>Hello</p>'
	});
	const sent = [],
		pushes = [];
	const env = {
		DB: context.binding,
		SEND_EMAILS: 'yes',
		EMAIL: {
			async send(message) {
				sent.push(message);
			}
		},
		PUSHOVER_QUEUE: {
			async send(message) {
				pushes.push(message);
			}
		}
	};
	return { ...context, env, sent, pushes };
}

const notify = (kind, env, extra = {}) => {
	const common = {
		threadId: 'thread',
		mentionedUserIds: ['reader', 'reader', 'author'],
		baseUrl: 'https://example.test',
		...extra
	};
	return kind === 'thread'
		? handleNewThreadFanout({ ...common, threadAuthorUserId: 'author' }, { env })
		: handleThreadReplyFanout({ ...common, postId: 'reply', replyAuthorUserId: 'author' }, { env });
};
const events = (sqlite) =>
	sqlite
		.prepare(
			'SELECT user_id, event_type, thread_id, post_id FROM notification_events ORDER BY user_id'
		)
		.all();

test('creating a discussion queues mentions by display name and email for delivery', async () => {
	const { db, env, sent } = await fixture();
	const author = await db.select().from(users).where(eq(users.id, 'author')).get();
	const queued = [];
	const form = new FormData();
	form.set('title', 'New discussion with mentions');
	form.set('categoryId', 'category');
	form.set('body', 'Hello @Ada Reader and @reader@example.test. Hello @watcher@example.test.');
	await assert.rejects(
		actions.default({
			locals: { db, user: author, permissions: new Set() },
			request: new Request('https://example.test/new', { method: 'POST', body: form }),
			url: new URL('https://example.test/new'),
			platform: {
				env: {
					STORIED_WORKER: {
						async send(message) {
							queued.push(message);
						}
					}
				}
			}
		}),
		(error) => error.status === 302 && error.location.startsWith('/thread/')
	);
	const message = queued.find((message) => message.topic === 'notifications.new-thread');
	assert.deepEqual(message.payload.mentionedUserIds.sort(), ['reader', 'watcher']);
	await handleNewThreadFanout(message.payload, { env });
	assert.deepEqual(sent.map((message) => message.to).sort(), [
		'reader@example.test',
		'watcher@example.test'
	]);
	assert.ok(sent.every((message) => message.subject.includes('mentioned you')));
});

for (const kind of ['thread', 'reply']) {
	for (const mode of [null, 'mute', 'daily_digest', 'immediate']) {
		test(`${kind} mentions bypass ${mode ?? 'absent'} subscriptions and send one email`, async () => {
			const { db, env, sent, sqlite } = await fixture();
			if (mode)
				await db.insert(subscriptions).values({
					id: 'reader-sub',
					userId: 'reader',
					...(kind === 'thread' ? { categoryId: 'category' } : { threadId: 'thread' }),
					mode
				});
			await db.insert(subscriptions).values({
				id: 'watcher-sub',
				userId: 'watcher',
				...(kind === 'thread' ? { categoryId: 'category' } : { threadId: 'thread' }),
				mode: 'immediate'
			});
			await notify(kind, env);
			assert.equal(sent.length, 2);
			const mention = sent.find((message) => message.to === 'reader@example.test');
			assert.match(mention.subject, /mentioned you/);
			assert.doesNotMatch(mention.text, /Secret ending/);
			assert.doesNotMatch(mention.html, /Secret ending/);
			assert.match(
				mention.text,
				kind === 'reply' ? /\?post=reply#post-reply/ : /\/thread\/a-discussion$/
			);
			assert.match(
				sent.find((message) => message.to === 'watcher@example.test').subject,
				/New (thread|reply)/
			);
			assert.deepEqual(
				events(sqlite).map((event) => [event.user_id, event.event_type, event.post_id]),
				[
					['reader', 'mention', kind === 'reply' ? 'reply' : null],
					['watcher', kind === 'reply' ? 'reply' : 'new_thread', kind === 'reply' ? 'reply' : null]
				]
			);
		});
	}

	test(`${kind} mentions respect global email off while push remains independent`, async () => {
		const { db, env, sent, pushes, sqlite } = await fixture();
		await db.update(users).set({ role: 'admin' }).where(eq(users.id, 'reader'));
		await db.insert(notificationPreferences).values({
			userId: 'reader',
			emailEnabled: false,
			pushoverEnabled: true,
			pushoverUserKey: 'key'
		});
		await notify(kind, env);
		assert.equal(sent.length, 0);
		assert.equal(events(sqlite).length, 0);
		assert.equal(pushes.length, 1);
		assert.equal(pushes[0].payload.eventType, 'mention');
		assert.equal(pushes[0].payload.userId, 'reader');
		assert.equal(
			pushes[0].payload.url,
			`https://example.test/thread/a-discussion${kind === 'reply' ? '?post=reply#post-reply' : ''}`
		);
		assert.doesNotMatch(pushes[0].payload.message, /Secret ending/);
	});

	for (const changes of [{ status: 'suspended' }, { status: 'pending' }, { lastLoginAt: null }]) {
		test(`${kind} mentions skip ineligible accounts ${JSON.stringify(changes)}`, async () => {
			const { db, env, sent, pushes, sqlite } = await fixture();
			await db.update(users).set(changes).where(eq(users.id, 'reader'));
			await notify(kind, env);
			assert.equal(sent.length, 0);
			assert.equal(pushes.length, 0);
			assert.equal(events(sqlite).length, 0);
		});
	}

	test(`${kind} mentions require group membership and admin discussion access`, async () => {
		const { db, env, sent } = await fixture();
		await db
			.insert(groups)
			.values({ id: 'group', name: 'Readers', slug: 'readers', createdByUserId: 'author' });
		await db.update(threads).set({ audienceGroupId: 'group' });
		await notify(kind, env);
		assert.equal(sent.length, 0);
		await db.insert(groupMemberships).values({ groupId: 'group', userId: 'reader' });
		await db.update(threads).set({ visibility: 'admins' });
		await notify(kind, env);
		assert.equal(sent.length, 0);
		await db.update(users).set({ role: 'moderator' }).where(eq(users.id, 'reader'));
		await notify(kind, env);
		assert.equal(sent.length, 1);
	});
}

test('announcement broadcasts send one mention email to mentioned members', async () => {
	const { env, sent, sqlite } = await fixture();
	await notify('thread', env, { broadcastToAllMembers: true });
	assert.equal(sent.length, 2);
	assert.match(
		sent.find((message) => message.to === 'reader@example.test').subject,
		/mentioned you/
	);
	assert.deepEqual(
		events(sqlite).map((event) => event.event_type),
		['mention', 'announcement']
	);
});

test('older queued new-thread messages still deliver category notifications', async () => {
	const { db, env, sent } = await fixture();
	await db.insert(subscriptions).values({
		id: 'reader-sub',
		userId: 'reader',
		categoryId: 'category',
		mode: 'immediate'
	});
	await notify('thread', env, { mentionedUserIds: undefined });
	assert.equal(sent.length, 1);
	assert.match(sent[0].subject, /New thread/);
});
