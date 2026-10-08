import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { formatSessionTimes } from '../shared/session-time.ts';
import { createSessionCalendarLinks } from '../shared/session-calendar-links.ts';
import { database } from './database.mjs';
import { sessions, users } from '../src/lib/server/db/schema.ts';
import {
	getOrCreateMemberAttendee,
	getOrCreatePublicAttendee,
	setMemberRsvp,
	submitSessionRsvp,
	upsertAdminParticipation
} from '../src/lib/server/rsvp.ts';
import { sendSessionMessage } from '../src/lib/server/session-messages.ts';
import { actions as cancelActions } from '../src/routes/cancel/[token]/+page.server.ts';

const meeting = (startsAt) => ({ startsAt, timezone: 'Atlantic/Bermuda' });

for (const [start, instant, londonClock] of [
	['2026-03-07T18:00', '2026-03-07T22:00:00.000Z', '10:00 PM'],
	['2026-03-08T18:00', '2026-03-08T21:00:00.000Z', '9:00 PM'],
	['2026-03-29T18:00', '2026-03-29T21:00:00.000Z', '10:00 PM'],
	['2026-10-31T18:00', '2026-10-31T21:00:00.000Z', '9:00 PM'],
	['2026-11-01T18:00', '2026-11-01T22:00:00.000Z', '10:00 PM']
]) {
	test(`meeting display and calendar links agree around daylight saving on ${start}`, () => {
		const session = { ...meeting(start), id: 'meeting', slug: 'meeting', durationMinutes: 90 };
		const times = formatSessionTimes(session, 'Europe/London');
		assert.equal(times.datetime, instant);
		assert.match(times.event, /6:00 PM.*\(Atlantic\/Bermuda\)/);
		assert.ok(times.local.includes(londonClock));
		assert.match(times.local, /\(Europe\/London\)/);
		const links = createSessionCalendarLinks(session, {
			detailsUrl: 'https://club.example.test/meeting'
		});
		const outlook = new URL(links.find((link) => link.kind === 'outlook-web').href);
		assert.equal(outlook.searchParams.get('startdt'), times.datetime);
	});
}

test('remote member dates can fall before or after the event date', () => {
	const east = formatSessionTimes(meeting('2026-10-08T18:00'), 'Asia/Tokyo');
	assert.match(east.event, /October 8, 2026.*6:00 PM/);
	assert.match(east.local, /October 9, 2026.*6:00 AM.*\(Asia\/Tokyo\)/);
	const west = formatSessionTimes(meeting('2026-10-08T00:30'), 'America/Los_Angeles');
	assert.match(west.event, /October 8, 2026.*12:30 AM/);
	assert.match(west.local, /October 7, 2026.*8:30 PM.*\(America\/Los_Angeles\)/);
});

test('explicit offsets retain their instant and host timezone never reinterprets the event', () => {
	const session = meeting('2026-10-08T18:00:00+02:00');
	const expected = formatSessionTimes(session, 'Asia/Tokyo');
	assert.equal(expected.datetime, '2026-10-08T16:00:00.000Z');
	assert.match(expected.event, /October 8, 2026.*1:00 PM/);
	assert.match(expected.local, /October 9, 2026.*1:00 AM/);
	const original = process.env.TZ;
	try {
		for (const timeZone of ['UTC', 'Pacific/Honolulu', 'Asia/Tokyo']) {
			process.env.TZ = timeZone;
			assert.deepEqual(formatSessionTimes(session, 'Asia/Tokyo'), expected);
			assert.equal(
				formatSessionTimes(meeting('2026-10-08T18:00')).datetime,
				'2026-10-08T21:00:00.000Z'
			);
		}
	} finally {
		if (original === undefined) delete process.env.TZ;
		else process.env.TZ = original;
	}
});

test('guests, matching clocks, invalid preferences, and undated drafts have no duplicate local line', () => {
	for (const timeZone of [null, undefined, 'Atlantic/Bermuda', 'America/Halifax', 'invalid'])
		assert.equal(formatSessionTimes(meeting('2026-10-08T18:00'), timeZone).local, null);
	assert.match(formatSessionTimes(meeting('2026-10-08T18:00')).event, /\(Atlantic\/Bermuda\)/);
	assert.equal(
		formatSessionTimes({ startsAt: '2026-10-08T18:00', timezone: 'invalid' }).datetime,
		'2026-10-08T21:00:00.000Z'
	);
	for (const startsAt of [null, 'invalid'])
		assert.deepEqual(formatSessionTimes(meeting(startsAt), 'Asia/Tokyo'), {
			event: 'Date to be confirmed',
			local: null,
			datetime: null
		});
});

test('meeting component renders labelled dates against one datetime for remote and matching preferences', async () => {
	const directory = mkdtempSync(join(tmpdir(), 'storied-session-time-'));
	try {
		const source = readFileSync('src/lib/components/session-time.svelte', 'utf8');
		const compiled = compile(source, { generate: 'server', filename: 'session-time.svelte' }).js
			.code;
		// Resolve the compiler's Svelte runtime from this project for the temporary module.
		const code = compiled.replaceAll(
			"'svelte/internal/server'",
			JSON.stringify(import.meta.resolve('svelte/internal/server'))
		);
		const modulePath = join(directory, 'session-time.mjs');
		writeFileSync(modulePath, code);
		const { default: Component } = await import(pathToFileURL(modulePath).href);
		const props = { session: meeting('2026-10-08T18:00'), memberTimeZone: 'Asia/Tokyo' };
		const html = render(Component, { props }).body;
		assert.match(html, /Atlantic\/Bermuda/);
		assert.match(html, /Your time:.*Asia\/Tokyo/s);
		assert.equal(html.match(/datetime="2026-10-08T21:00:00.000Z"/g).length, 2);
		assert.doesNotMatch(
			render(Component, { props: { ...props, memberTimeZone: 'Atlantic/Bermuda' } }).body,
			/Your time:/
		);
		assert.match(
			render(Component, { props: { session: meeting(null) } }).body,
			/Date to be confirmed/
		);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

async function fixture() {
	const context = database();
	const { db } = context;
	await db.insert(users).values({
		id: 'reader',
		email: 'reader@example.test',
		displayName: 'Reader',
		timezone: 'Asia/Tokyo'
	});
	await db.insert(sessions).values({
		id: 'meeting',
		slug: 'meeting',
		title: 'Meeting',
		status: 'scheduled',
		startsAt: '2099-10-01T18:00',
		timezone: 'Atlantic/Bermuda',
		rsvpCapacity: 1
	});
	const reader = await db.select().from(users).where(eq(users.id, 'reader')).get();
	const session = await db.select().from(sessions).where(eq(sessions.id, 'meeting')).get();
	const sent = [];
	const platform = {
		env: { SEND_EMAILS: true, EMAIL: { send: async (message) => sent.push(message) } }
	};
	return { ...context, reader, session, sent, platform };
}

function assertMemberTime(email) {
	assert.match(email.text, /October 1, 2099.*6:00 PM.*\(Atlantic\/Bermuda\)/);
	assert.match(email.text, /Your time:.*October 2, 2099.*6:00 AM.*\(Asia\/Tokyo\)/);
	assert.match(email.html, /Your time:.*October 2, 2099.*6:00 AM.*\(Asia\/Tokyo\)/s);
}

test('member registration confirmations include the saved local timezone in text and HTML', async () => {
	const { db, reader, session, platform, sent } = await fixture();
	await setMemberRsvp({ db, platform, user: reader, session, status: 'registered' });
	assert.equal(sent.length, 1);
	assertMemberTime(sent[0]);
});

test('session update emails include the member local date and time', async () => {
	const { db, reader, session, platform, sent } = await fixture();
	const attendee = await getOrCreateMemberAttendee(db, reader);
	await upsertAdminParticipation({ db, session, attendee, status: 'attending' });
	await sendSessionMessage({
		db,
		platform,
		session,
		senderUserId: reader.id,
		kind: 'update',
		audiences: ['attending'],
		subject: 'Meeting update',
		bodySource: 'The meeting details have changed.'
	});
	assert.equal(sent.length, 1);
	assertMemberTime(sent[0]);
});

test('waitlist confirmation and promotion preserve member local time while guest mail labels only the event', async () => {
	const { db, reader, session, platform, sent } = await fixture();
	const attendee = await getOrCreatePublicAttendee(db, 'Guest', 'guest@example.test');
	const registered = await submitSessionRsvp({
		db,
		platform,
		baseUrl: 'https://club.example.test',
		session,
		attendee,
		response: 'attending',
		source: 'public_form'
	});
	assert.match(sent[0].text, /\(Atlantic\/Bermuda\)/);
	assert.doesNotMatch(sent[0].text, /Your time:/);
	await setMemberRsvp({ db, platform, user: reader, session, status: 'registered' });
	assert.match(sent[1].subject, /Waitlisted/);
	assertMemberTime(sent[1]);
	await cancelActions.default({
		params: { token: registered.participant.confirmationToken },
		locals: { db },
		platform,
		url: new URL('https://club.example.test/cancel')
	});
	assert.match(sent.at(-1).subject, /spot opened/);
	assertMemberTime(sent.at(-1));
});
