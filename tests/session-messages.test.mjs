import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { database } from './database.mjs';
import {
	sessionMessageDeliveries,
	sessionMessages,
	sessions,
	themes,
	users
} from '../src/lib/server/db/schema.ts';
import { createClubSession } from '../src/lib/server/session-lifecycle.ts';
import { getOrCreateAdminAttendee, upsertAdminParticipation } from '../src/lib/server/rsvp.ts';
import {
	resolveSessionMessageRecipients,
	retrySessionMessage,
	sendSessionMessage
} from '../src/lib/server/session-messages.ts';
import {
	buildSessionUpdateMessage,
	detectSessionDetailChanges
} from '../shared/session-messages.ts';
import { actions as adminEdit } from '../src/routes/admin/sessions/[slug]/+page.server.ts';
import {
	load as messagesPage,
	actions as messageActions
} from '../src/routes/admin/sessions/[slug]/messages/+page.server.ts';

async function fixture() {
	const context = database();
	const { db } = context;
	await db.insert(themes).values({ id: 'theme', slug: 'theme', name: 'Test theme' });
	await db
		.insert(users)
		.values({ id: 'host', email: 'host@example.test', displayName: 'Host', role: 'admin' });
	const host = await db.select().from(users).where(eq(users.id, 'host')).get();
	const sent = [];
	const failing = new Set();
	const platform = {
		env: {
			SEND_EMAILS: true,
			EMAIL: {
				send: async (message) => {
					if (failing.has(message.to)) throw new Error(`Mailbox unavailable: ${message.to}`);
					sent.push(message);
				}
			}
		}
	};
	const locals = { db, user: host, permissions: new Set(['sessions:edit']) };
	const addSession = async (id, extra = {}) => {
		await createClubSession(
			db,
			{
				id,
				slug: id,
				title: id,
				themeId: 'theme',
				startsAt: '2099-10-01T18:00',
				timezone: 'Atlantic/Bermuda',
				status: 'scheduled',
				rsvpCapacity: 12,
				locationName: 'Library',
				...extra
			},
			'host',
			null
		);
		return db.select().from(sessions).where(eq(sessions.id, id)).get();
	};
	const addParticipant = async (session, name, email, status) => {
		const attendee = await getOrCreateAdminAttendee(db, { name, email });
		await upsertAdminParticipation({ db, session, attendee, status, note: null });
		return attendee;
	};
	return { ...context, host, sent, failing, platform, locals, addSession, addParticipant };
}

const formRequest = (fields) =>
	new Request('https://club.example.test/admin/sessions', {
		method: 'POST',
		body: new URLSearchParams(fields)
	});

test('recipients follow the chosen audiences, skip missing emails, and count each person once', async () => {
	const { db, addSession, addParticipant } = await fixture();
	const earlier = await addSession('earlier', { status: 'past', startsAt: '2020-01-01T18:00' });
	const session = await addSession('meeting');

	await addParticipant(session, 'Ada', 'ada@example.test', 'attending');
	await addParticipant(session, 'Bea', 'bea@example.test', 'waitlisted');
	await addParticipant(session, 'Cy', null, 'maybe');
	await addParticipant(earlier, 'Dee', 'dee@example.test', 'attended');
	const eve = await addParticipant(earlier, 'Eve', 'eve@example.test', 'attended');
	await upsertAdminParticipation({ db, session, attendee: eve, status: 'declined', note: null });
	await addParticipant(earlier, 'Ada', 'ada@example.test', 'attended');

	const { recipients, byAudience } = await resolveSessionMessageRecipients(db, session, [
		'attending',
		'past_attendees'
	]);
	assert.deepEqual(
		recipients.map((recipient) => [recipient.name, recipient.audience]),
		[
			['Ada', 'attending'],
			['Dee', 'past_attendees']
		]
	);
	assert.deepEqual(
		byAudience.waitlisted.map((recipient) => recipient.name),
		['Bea']
	);
	assert.equal(byAudience.maybe.length, 0);
	assert.deepEqual(
		byAudience.past_attendees.map((recipient) => recipient.name),
		['Dee']
	);
});

test('sending records one delivery per recipient and a retry only re-sends failures', async () => {
	const { db, platform, sent, failing, addSession, addParticipant } = await fixture();
	const session = await addSession('meeting');
	await addParticipant(session, 'Ada', 'ada@example.test', 'attending');
	await addParticipant(session, 'Bea', 'bea@example.test', 'attending');
	failing.add('bea@example.test');

	const result = await sendSessionMessage({
		db,
		platform,
		session,
		senderUserId: 'host',
		kind: 'custom',
		audiences: ['attending'],
		subject: 'Bring a snack',
		bodySource: 'Please bring **something** to share.'
	});
	assert.equal(result.recipientCount, 2);
	assert.equal(result.sentCount, 1);
	assert.equal(result.failedCount, 1);
	assert.equal(sent.length, 1);
	assert.equal(sent[0].to, 'ada@example.test');
	assert.match(sent[0].text, /Hi Ada,/);
	assert.match(sent[0].text, /Please bring \*\*something\*\* to share\./);
	assert.match(sent[0].html, /<strong>something<\/strong>/);
	assert.match(sent[0].text, /you have a confirmed place/);

	const message = await db.select().from(sessionMessages).get();
	assert.equal(message.failedCount, 1);
	const failed = await db
		.select()
		.from(sessionMessageDeliveries)
		.where(eq(sessionMessageDeliveries.status, 'failed'))
		.get();
	assert.equal(failed.recipientEmail, 'bea@example.test');
	assert.match(failed.failureReason, /Mailbox unavailable/);

	failing.clear();
	const retry = await retrySessionMessage({ db, platform, session, messageId: message.id });
	assert.equal(retry.attempted, 1);
	assert.equal(retry.retried, 1);
	assert.equal(retry.failedCount, 0);
	assert.equal(sent.length, 2);
	assert.equal(sent[1].to, 'bea@example.test');
	assert.equal(
		(await db.select().from(sessionMessages).where(eq(sessionMessages.id, message.id)).get())
			.sentCount,
		2
	);
});

test('detail changes describe the moved time and place for a prepared update', () => {
	const before = {
		title: 'Meeting',
		startsAt: '2099-10-01T18:00',
		timezone: 'UTC',
		locationName: 'Library'
	};
	const after = { ...before, startsAt: '2099-10-02T19:30', locationName: 'Cafe' };
	const changes = detectSessionDetailChanges(before, after);
	assert.deepEqual(
		changes.map((change) => change.field),
		['when', 'location']
	);
	assert.equal(changes[1].from, 'Library');
	assert.equal(changes[1].to, 'Cafe');
	const draft = buildSessionUpdateMessage(after, changes);
	assert.equal(draft.subject, 'Update: Meeting');
	assert.match(draft.body, /\*\*Where:\*\* Cafe \(was Library\)/);
	assert.equal(detectSessionDetailChanges(before, before).length, 0);
});

test('saving a moved published session offers an update only when someone has replied', async () => {
	const { db, locals, addSession, addParticipant } = await fixture();
	const session = await addSession('meeting');
	const fields = (row, changes) => ({
		expectedUpdatedAt: row.updatedAt,
		title: row.title,
		themeId: 'theme',
		startsAt: row.startsAt,
		timezone: row.timezone,
		locationName: row.locationName ?? '',
		rsvpCapacity: String(row.rsvpCapacity),
		rsvpEnabled: 'on',
		...changes
	});

	const quiet = await adminEdit.updateSession({
		locals,
		params: { slug: session.slug },
		request: formRequest(fields(session, { locationName: 'Cafe' }))
	});
	assert.equal(quiet.updated, true);
	assert.deepEqual(quiet.detailChanges, []);

	let row = await db.select().from(sessions).where(eq(sessions.id, session.id)).get();
	await addParticipant(row, 'Ada', 'ada@example.test', 'attending');
	const moved = await adminEdit.updateSession({
		locals,
		params: { slug: session.slug },
		request: formRequest(fields(row, { startsAt: '2099-10-03T18:00' }))
	});
	assert.equal(moved.detailChanges.length, 1);
	assert.equal(moved.detailChanges[0].field, 'when');
	assert.equal(moved.previousDetails.startsAt, '2099-10-01T18:00');

	row = await db.select().from(sessions).where(eq(sessions.id, session.id)).get();
	const cancelled = await adminEdit.updateStatus({
		locals,
		params: { slug: session.slug },
		request: formRequest({ expectedUpdatedAt: row.updatedAt, status: 'cancelled' })
	});
	assert.equal(cancelled.cancelled, true);
});

test('the composer prefills an update from the previous details and sends through the action', async () => {
	const { db, locals, platform, sent, addSession, addParticipant } = await fixture();
	const session = await addSession('meeting', { locationName: 'Cafe' });
	await addParticipant(session, 'Ada', 'ada@example.test', 'attending');
	await addParticipant(session, 'Bea', 'bea@example.test', 'waitlisted');

	const page = await messagesPage({
		locals,
		params: { slug: session.slug },
		url: new URL(
			'https://club.example.test/admin/sessions/meeting/messages?template=update&prevStartsAt=2099-10-01T18:00&prevTimezone=Atlantic/Bermuda&prevLocation=Library'
		)
	});
	assert.equal(page.template.kind, 'update');
	assert.match(page.template.draft.body, /\*\*Where:\*\* Cafe \(was Library\)/);
	assert.deepEqual(page.template.audiences, ['attending', 'waitlisted', 'maybe']);
	assert.equal(page.audiences.find((group) => group.key === 'attending').recipients.length, 1);

	const request = new Request('https://club.example.test/admin/sessions/meeting/messages', {
		method: 'POST',
		body: new URLSearchParams([
			['audiences', 'attending'],
			['audiences', 'waitlisted'],
			['kind', 'update'],
			['subject', page.template.draft.subject],
			['body', page.template.draft.body]
		])
	});
	const result = await messageActions.send({
		locals,
		platform,
		params: { slug: session.slug },
		request
	});
	assert.equal(result.sent, true);
	assert.equal(result.sentCount, 2);
	assert.deepEqual(sent.map((message) => message.to).sort(), [
		'ada@example.test',
		'bea@example.test'
	]);
	assert.match(sent.find((message) => message.to === 'bea@example.test').text, /waitlist/);
	const listed = await messagesPage({
		locals,
		params: { slug: session.slug },
		url: new URL('https://club.example.test/admin/sessions/meeting/messages')
	});
	assert.equal(listed.messages.length, 1);
	assert.equal(listed.messages[0].deliveries.length, 2);
	assert.equal(listed.template.kind, 'custom');
});
