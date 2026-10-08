import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { database } from './database.mjs';
import {
	attendeeIdentities,
	calendarSubscriptions,
	sessionParticipants,
	sessions,
	users
} from '../src/lib/server/db/schema.ts';
import {
	createCalendarSubscription,
	ownCalendarSubscription,
	subscribedMeetingCalendar
} from '../src/lib/server/session-calendar.ts';
import { GET as download } from '../src/routes/sessions/[slug]/calendar.ics/+server.ts';
import { GET as feed } from '../src/routes/calendar/[token]/meetings.ics/+server.ts';
import { actions as settings } from '../src/routes/settings/+page.server.ts';
import {
	sendRegistrationConfirmationEmail,
	sendWaitlistConfirmationEmail,
	sendWaitlistPromotionEmail,
	sendCancellationConfirmationEmail
} from '../src/lib/server/rsvp-email.ts';
import { createSessionCalendarLinks } from '../shared/session-calendar-links.ts';
import { cancelParticipantByToken } from '../src/lib/server/rsvp.ts';

const unfold = (text) => text.replace(/\r\n[ \t]/g, '');
const property = (text, name) => text.match(new RegExp(`^${name}:(.*)$`, 'm'))?.[1].trim();
const events = (text) =>
	[...text.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/g)].map((m) => m[1]);

async function fixture() {
	const context = database();
	const { db } = context;
	await db.insert(users).values([
		{ id: 'member', email: 'member@example.test', displayName: 'Member' },
		{ id: 'other', email: 'other@example.test', displayName: 'Other' }
	]);
	await db.insert(attendeeIdentities).values([
		{ id: 'member', userId: 'member', name: 'Member', email: 'member@example.test' },
		{ id: 'other', userId: 'other', name: 'Other', email: 'other@example.test' },
		{ id: 'guest', name: 'Guest', email: 'guest@example.test' }
	]);
	await db.insert(sessions).values({
		id: 'meeting',
		slug: 'meeting',
		title: 'Read, discuss; repeat',
		status: 'scheduled',
		startsAt: '2099-10-01T18:00',
		timezone: 'Atlantic/Bermuda',
		durationMinutes: 90,
		themeTitle: 'A theme',
		locationName: 'Private venue',
		bodySource: 'Facilitator-only notes',
		isPublic: false
	});
	await db.insert(sessionParticipants).values(
		['member', 'guest'].map((id) => ({
			id,
			sessionId: 'meeting',
			attendeeId: id,
			nameSnapshot: id,
			attendanceStatus: 'waitlisted',
			confirmationToken: `${id}-cancel`
		}))
	);
	const member = await db.select().from(users).where(eq(users.id, 'member')).get();
	const locals = { db, user: member, permissions: new Set(['access:general']) };
	const guestLocals = { db, user: null, permissions: new Set() };
	const row = () => db.select().from(sessions).where(eq(sessions.id, 'meeting')).get();
	const participant = (id = 'member') =>
		db.select().from(sessionParticipants).where(eq(sessionParticipants.id, id)).get();
	const get = (slug = 'meeting', token, viewer = locals) =>
		download({
			locals: viewer,
			params: { slug },
			url: new URL(
				`https://example.test/sessions/${slug}/calendar.ics${token ? `?token=${token}` : ''}`
			)
		});
	const tokenOf = (url) => new URL(url).pathname.split('/')[2];
	const subscribe = async (includeWaitlist = true) =>
		tokenOf(await createCalendarSubscription(db, 'member', includeWaitlist));
	const calendar = async (token) => {
		const response = await feed({ locals: guestLocals, params: { token } });
		assert.equal(response.status, 200);
		assert.equal(response.headers.get('cache-control'), 'private, no-store');
		return unfold(await response.text());
	};
	return { ...context, locals, guestLocals, row, participant, get, subscribe, calendar, tokenOf };
}

for (const kind of ['member', 'guest']) {
	test(`${kind} calendar tracks tentative RSVP, promotion, and cancellation with the same UID`, async () => {
		const { db, get, participant, guestLocals } = await fixture();
		const p = await participant(kind);
		const read = () => (kind === 'member' ? get() : get('meeting', p.calendarToken, guestLocals));
		const response = await read();
		assert.equal(response.status, 200);
		assert.equal(response.headers.get('cache-control'), 'private, no-store');
		const first = unfold(await response.text());
		assert.match(first, /SUMMARY:Read\\, discuss\\; repeat/);
		assert.match(first, /STATUS:TENTATIVE/);
		assert.match(first, /RSVP: Waitlisted/);
		assert.match(first, /DTSTART:20991001T210000Z/);
		assert.match(first, /DURATION:PT90M/);
		assert.doesNotMatch(first, /Facilitator-only|member@example|guest@example|cancel|token=/);
		await db
			.update(sessionParticipants)
			.set({ attendanceStatus: 'attending' })
			.where(eq(sessionParticipants.id, kind));
		const confirmed = unfold(await (await read()).text());
		assert.match(confirmed, /STATUS:CONFIRMED/);
		assert.equal(property(confirmed, 'UID'), property(first, 'UID'));
		assert.ok(Number(property(confirmed, 'SEQUENCE')) > Number(property(first, 'SEQUENCE')));
		const cancelledResult = await cancelParticipantByToken(db, p.confirmationToken);
		assert.ok(cancelledResult);
		const cancelled = unfold(await (await read()).text());
		assert.match(cancelled, /STATUS:CANCELLED/);
		assert.equal(property(cancelled, 'UID'), property(first, 'UID'));
		assert.ok(Number(property(cancelled, 'SEQUENCE')) > Number(property(confirmed, 'SEQUENCE')));
		assert.doesNotMatch(cancelled, /Private venue|LOCATION:|URL:/);
	});
}

test('guest capability is read-only and scoped to one registration and meeting', async () => {
	const { db, get, participant, guestLocals } = await fixture();
	const guest = await participant('guest');
	assert.notEqual(guest.calendarToken, guest.confirmationToken);
	await db.insert(sessions).values({
		id: 'other-meeting',
		slug: 'other-meeting',
		title: 'Other private meeting',
		status: 'scheduled'
	});
	for (const [slug, token] of [
		['meeting', undefined],
		['meeting', 'a'.repeat(64)],
		['other-meeting', guest.calendarToken],
		['meeting', guest.confirmationToken]
	]) {
		const response = await get(slug, token, guestLocals);
		assert.equal(response.status, 404);
		assert.equal(response.headers.get('cache-control'), 'private, no-store');
	}
	assert.equal(await cancelParticipantByToken(db, guest.calendarToken), null);
	assert.equal((await participant('guest')).attendanceStatus, 'waitlisted');
	assert.equal((await get('meeting', guest.calendarToken, guestLocals)).status, 200);
	await db.update(sessions).set({ status: 'draft' }).where(eq(sessions.id, 'meeting'));
	assert.equal((await get('meeting', guest.calendarToken, guestLocals)).status, 404);
});

test('member access requires current active membership and an owned registration', async () => {
	const { db, get, locals } = await fixture();
	const other = await db.select().from(users).where(eq(users.id, 'other')).get();
	assert.equal((await get('meeting', undefined, { ...locals, user: other })).status, 404);
	await db.update(users).set({ status: 'suspended' }).where(eq(users.id, 'member'));
	assert.equal((await get()).status, 404);
});

test('confirmation and promotion emails give guests scoped ICS and RSVP-aware calendar links', async () => {
	const { db, row, participant } = await fixture();
	const session = await row();
	const attendee = await db
		.select()
		.from(attendeeIdentities)
		.where(eq(attendeeIdentities.id, 'guest'))
		.get();
	const sent = [];
	const platform = {
		env: { SEND_EMAILS: true, EMAIL: { send: async (email) => sent.push(email) } }
	};
	const p = await participant('guest');
	await sendWaitlistConfirmationEmail(platform, session, p, attendee, 'https://example.test', db);
	const ics = sent[0].text.match(/iCal: (\S+)/)[1];
	assert.equal(new URL(ics).searchParams.get('token'), p.calendarToken);
	assert.match(decodeURIComponent(sent[0].text), /Waitlisted/);
	await db
		.update(sessionParticipants)
		.set({ attendanceStatus: 'attending' })
		.where(eq(sessionParticipants.id, 'guest'));
	const promoted = await participant('guest');
	await sendWaitlistPromotionEmail(
		platform,
		session,
		promoted,
		attendee,
		'https://example.test',
		db
	);
	await sendRegistrationConfirmationEmail(
		platform,
		session,
		promoted,
		attendee,
		'https://example.test',
		db
	);
	assert.equal(sent[1].text.match(/iCal: (\S+)/)[1], ics);
	assert.equal(sent[2].text.match(/iCal: (\S+)/)[1], ics);
	await db
		.update(sessionParticipants)
		.set({ attendanceStatus: 'cancelled' })
		.where(eq(sessionParticipants.id, 'guest'));
	await sendCancellationConfirmationEmail(platform, session, attendee, db);
	assert.match(sent[3].text, /Update calendar:/);
	assert.equal(sent[3].text.match(/iCal: (\S+)/)[1], ics);
	assert.doesNotMatch(sent[3].text, /calendar.google.com|outlook.live.com/);
	const links = createSessionCalendarLinks(session, {
		detailsUrl: 'https://example.test/meeting',
		attendanceStatus: 'waitlisted'
	});
	for (const link of links) {
		const url = new URL(link.href);
		const title =
			url.searchParams.get('text') ??
			url.searchParams.get('title') ??
			url.searchParams.get('subject');
		assert.equal(title, `${session.title} (Waitlisted)`);
		assert.ok([...url.searchParams.values()].some((value) => value.includes('RSVP: Waitlisted')));
	}
});

test('feed isolates members, omits private content, and supports an empty calendar and optional waitlist', async () => {
	const { db, subscribe, calendar } = await fixture();
	let token = await subscribe(false);
	assert.equal(events(await calendar(token)).length, 0);
	token = await subscribe(true);
	const contents = await calendar(token);
	assert.equal(events(contents).length, 1);
	assert.match(contents, /STATUS:TENTATIVE/);
	assert.doesNotMatch(contents, /Facilitator-only|member@example|guest@example/);
	await db.insert(sessions).values({
		id: 'unregistered',
		slug: 'unregistered',
		title: 'Unregistered secret',
		startsAt: '2099-10-01T18:00',
		durationMinutes: 60,
		status: 'scheduled'
	});
	await db
		.insert(sessionParticipants)
		.values({ id: 'other', sessionId: 'unregistered', attendeeId: 'other', nameSnapshot: 'Other' });
	assert.doesNotMatch(await calendar(token), /Unregistered secret|UID:unregistered/);
});

test('rescheduling and timezone changes update one event, preserve UID, and leave metadata stable on repeated fetches', async () => {
	const { db, sqlite, subscribe, calendar, get } = await fixture();
	const token = await subscribe();
	const first = await calendar(token);
	await db
		.update(sessions)
		.set({
			startsAt: '2099-11-01T18:00',
			timezone: 'Europe/London',
			durationMinutes: 120,
			title: 'New title',
			locationName: 'New venue'
		})
		.where(eq(sessions.id, 'meeting'));
	const second = await calendar(token);
	assert.equal(property(second, 'UID'), property(first, 'UID'));
	assert.match(second, /DTSTART:20991101T180000Z/);
	assert.match(second, /SUMMARY:New title/);
	assert.match(second, /DURATION:PT120M/);
	assert.match(second, /LOCATION:New venue/);
	assert.equal(events(second).length, 1);
	assert.ok(Number(property(second, 'SEQUENCE')) > Number(property(first, 'SEQUENCE')));
	const repeated = await calendar(token);
	assert.equal(property(repeated, 'LAST-MODIFIED'), property(second, 'LAST-MODIFIED'));
	assert.equal(property(repeated, 'SEQUENCE'), property(second, 'SEQUENCE'));
	const individual = unfold(await (await get()).text());
	assert.equal(property(individual, 'UID'), property(second, 'UID'));
	assert.equal(property(individual, 'SEQUENCE'), property(second, 'SEQUENCE'));
	const sequence = sqlite
		.prepare('SELECT sequence FROM session_calendar_entries WHERE attendee_id = ?')
		.get('member').sequence;
	await db
		.update(sessions)
		.set({ title: 'New title', facilitatorRecap: 'Private recap' })
		.where(eq(sessions.id, 'meeting'));
	assert.equal(
		sqlite
			.prepare('SELECT sequence FROM session_calendar_entries WHERE attendee_id = ?')
			.get('member').sequence,
		sequence
	);
});

for (const change of [
	'rsvp cancellation',
	'participant deletion',
	'meeting cancellation',
	'meeting deletion',
	'draft'
]) {
	test(`feed retains a cancellation with the same UID after ${change}`, async () => {
		const { db, subscribe, calendar } = await fixture();
		const token = await subscribe();
		const first = await calendar(token);
		if (change === 'rsvp cancellation')
			await db
				.update(sessionParticipants)
				.set({ attendanceStatus: 'cancelled' })
				.where(eq(sessionParticipants.id, 'member'));
		else if (change === 'participant deletion')
			await db.delete(sessionParticipants).where(eq(sessionParticipants.id, 'member'));
		else if (change === 'meeting deletion')
			await db.delete(sessions).where(eq(sessions.id, 'meeting'));
		else
			await db
				.update(sessions)
				.set({ status: change === 'draft' ? 'draft' : 'cancelled' })
				.where(eq(sessions.id, 'meeting'));
		const next = await calendar(token);
		assert.match(next, /STATUS:CANCELLED/);
		assert.equal(property(next, 'UID'), property(first, 'UID'));
		assert.ok(Number(property(next, 'SEQUENCE')) > Number(property(first, 'SEQUENCE')));
		assert.doesNotMatch(next, /LOCATION:|URL:|Private venue|Facilitator-only/);
		if (change === 'draft' || change.endsWith('deletion'))
			assert.doesNotMatch(next, /Read\\, discuss/);
	});
}

test('revocation, replacement and membership departure invalidate the feed without a login redirect', async () => {
	const { db, locals, subscribe, tokenOf } = await fixture();
	let token = await subscribe();
	const stored = await db.select().from(calendarSubscriptions).get();
	assert.notEqual(stored.tokenHash, token);
	assert.deepEqual(Object.keys(await ownCalendarSubscription(db, 'member')).sort(), [
		'createdAt',
		'includeWaitlist'
	]);
	const replacement = await settings.createCalendarSubscription({
		locals,
		setHeaders: (headers) => assert.equal(headers['Cache-Control'], 'private, no-store'),
		request: new Request('https://example.test/settings', {
			method: 'POST',
			body: new URLSearchParams({ includeWaitlist: 'on', userId: 'other' })
		})
	});
	assert.equal((await subscribedMeetingCalendar(db, token)).status, 404);
	token = tokenOf(replacement.calendarUrl);
	assert.equal((await subscribedMeetingCalendar(db, token)).status, 200);
	await settings.revokeCalendarSubscription({ locals });
	assert.equal((await subscribedMeetingCalendar(db, token)).status, 404);
	token = await subscribe();
	await db.update(users).set({ status: 'suspended' }).where(eq(users.id, 'member'));
	assert.equal((await subscribedMeetingCalendar(db, token)).status, 404);
	await assert.rejects(
		settings.createCalendarSubscription({
			locals,
			request: new Request('https://example.test/settings', { method: 'POST' })
		}),
		(e) => e.status === 403
	);
	await db.update(users).set({ status: 'active' }).where(eq(users.id, 'member'));
	assert.equal((await subscribedMeetingCalendar(db, token)).status, 404);
	assert.equal((await subscribedMeetingCalendar(db, 'invalid')).status, 404);
});

test('calendar migration backfills legacy RSVPs with independent tokens and event metadata', () => {
	const { sqlite } = database('0039_session_calendars.sql');
	sqlite.exec(
		"INSERT INTO attendee_identities(id,name) VALUES ('guest','Guest'); INSERT INTO sessions(id,slug,title,status,starts_at,duration_minutes) VALUES ('meeting','meeting','Meeting','scheduled','2099-10-01T18:00',90); INSERT INTO session_participants(id,session_id,attendee_id,name_snapshot,confirmation_token) VALUES ('guest','meeting','guest','Guest','cancel');"
	);
	sqlite.exec(readFileSync('migrations/0039_session_calendars.sql', 'utf8'));
	const token = sqlite
		.prepare('SELECT calendar_token FROM session_participants')
		.get().calendar_token;
	assert.match(token, /^[a-f0-9]{64}$/);
	assert.notEqual(token, 'cancel');
	assert.equal(sqlite.prepare('SELECT count(*) AS n FROM session_calendar_entries').get().n, 1);
	sqlite.exec(
		"INSERT INTO attendee_identities(id,name) VALUES ('new','New'); INSERT INTO session_participants(id,session_id,attendee_id,name_snapshot) VALUES ('new','meeting','new','New');"
	);
	assert.match(
		sqlite.prepare("SELECT calendar_token FROM session_participants WHERE id = 'new'").get()
			.calendar_token,
		/^[a-f0-9]{64}$/
	);
});

test('feed follows promotion, cancellation, and re-registration without duplicating the event', async () => {
	const { db, subscribe, calendar } = await fixture();
	const token = await subscribe();
	let previous = await calendar(token);
	for (const [attendanceStatus, status] of [
		['attending', 'CONFIRMED'],
		['cancelled', 'CANCELLED'],
		['attending', 'CONFIRMED']
	]) {
		await db
			.update(sessionParticipants)
			.set({ attendanceStatus })
			.where(eq(sessionParticipants.id, 'member'));
		const next = await calendar(token);
		assert.equal(events(next).length, 1);
		assert.equal(property(next, 'STATUS'), status);
		assert.equal(property(next, 'UID'), property(previous, 'UID'));
		assert.ok(Number(property(next, 'SEQUENCE')) > Number(property(previous, 'SEQUENCE')));
		previous = next;
	}
});

test('undating a meeting cancels its prior calendar time, and deleted RSVPs can be re-created with a later sequence', async () => {
	const { db, subscribe, calendar } = await fixture();
	const token = await subscribe();
	const initial = await calendar(token);
	await db
		.update(sessions)
		.set({ startsAt: null, durationMinutes: null })
		.where(eq(sessions.id, 'meeting'));
	const undated = await calendar(token);
	assert.match(undated, /STATUS:CANCELLED/);
	assert.equal(property(undated, 'DTSTART'), property(initial, 'DTSTART'));
	await db
		.update(sessions)
		.set({ startsAt: '2099-10-01T18:00', durationMinutes: 90 })
		.where(eq(sessions.id, 'meeting'));
	await db.delete(sessionParticipants).where(eq(sessionParticipants.id, 'member'));
	const deleted = await calendar(token);
	await db.insert(sessionParticipants).values({
		id: 'replacement',
		sessionId: 'meeting',
		attendeeId: 'member',
		nameSnapshot: 'Member',
		attendanceStatus: 'attending'
	});
	const restored = await calendar(token);
	assert.equal(events(restored).length, 1);
	assert.match(restored, /STATUS:CONFIRMED/);
	assert.equal(property(restored, 'UID'), property(deleted, 'UID'));
	assert.ok(Number(property(restored, 'SEQUENCE')) > Number(property(deleted, 'SEQUENCE')));
});

test('history retains recent past events and drops meetings and cancellations outside the reconciliation window', async () => {
	const { db, sqlite, subscribe } = await fixture();
	const token = await subscribe();
	await db
		.update(sessions)
		.set({ startsAt: '2026-09-01T18:00', timezone: 'UTC' })
		.where(eq(sessions.id, 'meeting'));
	assert.equal(
		events(
			unfold(
				await (await subscribedMeetingCalendar(db, token, new Date('2026-10-08T12:00:00Z'))).text()
			)
		).length,
		1
	);
	await db.update(sessions).set({ startsAt: '2025-01-01T18:00' }).where(eq(sessions.id, 'meeting'));
	assert.equal(
		events(
			unfold(
				await (await subscribedMeetingCalendar(db, token, new Date('2026-10-08T12:00:00Z'))).text()
			)
		).length,
		0
	);
	await db.delete(sessionParticipants).where(eq(sessionParticipants.id, 'member'));
	sqlite.exec(
		"UPDATE session_calendar_entries SET changed_at = '2026-10-08T10:00:00Z' WHERE attendee_id = 'member'"
	);
	assert.equal(
		events(
			unfold(
				await (await subscribedMeetingCalendar(db, token, new Date('2026-10-08T12:00:00Z'))).text()
			)
		).length,
		1
	);
	assert.equal(
		events(
			unfold(
				await (await subscribedMeetingCalendar(db, token, new Date('2027-02-08T12:00:00Z'))).text()
			)
		).length,
		0
	);
});
