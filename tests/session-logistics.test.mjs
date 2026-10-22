import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { database } from './database.mjs';
import {
	venues,
	sessions,
	users,
	themes,
	attendeeIdentities,
	sessionParticipants
} from '../src/lib/server/db/schema.ts';
import { parseLogistics, resolveSessionLogistics } from '../src/lib/server/session-logistics.ts';
import {
	actions as venueActions,
	load as venuePage
} from '../src/routes/admin/venues/+page.server.ts';
import { actions as createActions } from '../src/routes/admin/sessions/+page.server.ts';
import { actions as editActions } from '../src/routes/admin/sessions/[slug]/+page.server.ts';
import { load as rsvpPage } from '../src/routes/rsvp/[eventSlug]/+page.server.ts';
import { load as cancelPage } from '../src/routes/cancel/[token]/+page.server.ts';
import { GET as publicApi } from '../src/routes/api/v1/sessions/+server.ts';
import { downloadSessionCalendar } from '../src/lib/server/session-calendar.ts';
import {
	sendRegistrationConfirmationEmail,
	sendWaitlistConfirmationEmail,
	sendWaitlistPromotionEmail
} from '../src/lib/server/rsvp-email.ts';
import { renderSessionReminderEmail } from '../shared/session-reminder-email.ts';
import { draftFromTemplate, sendSessionMessage } from '../src/lib/server/session-messages.ts';

const form = (fields) => {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
};
const request = (fields) =>
	new Request('https://example.test/admin/sessions', { method: 'POST', body: form(fields) });
const secret = {
	locationAddress: '15 Private Lane\nHamilton',
	joiningUrl: 'https://zoom.example.test/join?pwd=secret',
	accessibilityNotes: 'Side entrance with lift',
	meetingFormat: 'hybrid'
};
const assertPrivate = (value, visible) => {
	const text = JSON.stringify(value);
	for (const term of ['15 Private Lane', 'pwd=secret', 'Side entrance with lift']) {
		if (visible) assert.ok(text.includes(term), term);
		else assert.ok(!text.includes(term), term);
	}
};
async function fixture() {
	const context = database();
	const { db } = context;
	await db
		.insert(users)
		.values({ id: 'host', displayName: 'Host', email: 'host@example.test', role: 'admin' });
	const user = await db.select().from(users).get();
	const locals = { db, user, permissions: new Set(['sessions:edit', 'access:general']) };
	const anonymous = { db, user: null, permissions: new Set() };
	await db.insert(themes).values({ id: 'theme', slug: 'theme', name: 'Theme' });
	await db.insert(venues).values({
		id: 'library',
		name: 'Bermuda National Library',
		address: secret.locationAddress,
		joiningUrl: secret.joiningUrl,
		accessibilityNotes: secret.accessibilityNotes,
		meetingFormat: 'hybrid'
	});
	await db.insert(sessions).values({
		id: 'meeting',
		slug: 'meeting',
		title: 'Meeting',
		status: 'scheduled',
		startsAt: '2099-10-01T18:00',
		durationMinutes: 90,
		timezone: 'Atlantic/Bermuda',
		themeId: 'theme',
		isPublic: true,
		venueId: 'library',
		locationName: 'Bermuda National Library',
		...secret
	});
	await db.insert(attendeeIdentities).values([
		{ id: 'guest', name: 'Guest', email: 'guest@example.test' },
		{ id: 'member', userId: 'host', name: 'Host', email: 'host@example.test' }
	]);
	await db.insert(sessionParticipants).values(
		['guest', 'member'].map((id) => ({
			id,
			sessionId: 'meeting',
			attendeeId: id,
			nameSnapshot: id,
			attendanceStatus: 'attending',
			confirmationToken: id + '-cancel'
		}))
	);
	const row = () => db.select().from(sessions).where(eq(sessions.id, 'meeting')).get();
	const participant = (id = 'guest') =>
		db.select().from(sessionParticipants).where(eq(sessionParticipants.id, id)).get();
	const load = (token, viewer = anonymous, slug = 'meeting') =>
		rsvpPage({
			locals: viewer,
			params: { eventSlug: slug },
			url: new URL(`https://example.test/rsvp/${slug}${token ? `?token=${token}` : ''}`),
			setHeaders: (headers) => assert.equal(headers['Cache-Control'], 'private, no-store')
		});
	const sent = [];
	const platform = {
		env: { SEND_EMAILS: true, EMAIL: { send: async (message) => sent.push(message) } }
	};
	return { ...context, locals, anonymous, row, participant, load, sent, platform };
}

test('venue management requires permission and supports save, stale edits, archive and restore', async () => {
	const { db, locals, anonymous } = await fixture();
	await assert.rejects(
		venuePage({ locals: anonymous }),
		(error) => error.status === 403 || error.status === 303
	);
	const fields = {
		locationName: 'Video room',
		meetingFormat: 'online',
		joiningUrl: secret.joiningUrl
	};
	assert.equal((await venueActions.save({ locals, request: request(fields) })).saved, true);
	let venue = (await db.select().from(venues)).find((item) => item.name === 'Video room');
	assert.equal(venue.joiningUrl, secret.joiningUrl);
	const stale = await venueActions.save({
		locals,
		request: request({ ...fields, id: venue.id, expectedUpdatedAt: 'stale' })
	});
	assert.equal(stale.status, 409);
	await venueActions.archive({ locals, request: request({ id: venue.id }) });
	await assert.rejects(resolveSessionLogistics(db, form({ venueId: venue.id })), /available venue/);
	await venueActions.archive({ locals, request: request({ id: venue.id, restore: 'yes' }) });
	assert.equal(
		(await resolveSessionLogistics(db, form({ venueId: venue.id }))).locationName,
		'Video room'
	);
});

test('sessions copy saved venues without JavaScript and keep details when a library venue changes', async () => {
	const { db, row } = await fixture();
	assertPrivate(await resolveSessionLogistics(db, form({ venueId: 'library' })), true);
	await db
		.update(venues)
		.set({ address: 'New address', archivedAt: '2099-01-01' })
		.where(eq(venues.id, 'library'));
	assertPrivate(await row(), true);
	const current = await row();
	const edited = await resolveSessionLogistics(
		db,
		form({ venueId: 'library', locationName: current.locationName, ...secret }),
		current
	);
	assert.equal(edited.locationAddress, secret.locationAddress);
	const custom = await resolveSessionLogistics(
		db,
		form({ venueId: '', locationName: 'Somewhere else', joiningUrl: secret.joiningUrl })
	);
	assert.equal(custom.venueId, null);
	assert.equal(custom.locationName, 'Somewhere else');
	const legacy = await resolveSessionLogistics(db, form({ locationName: 'Renamed' }), current);
	assert.equal(legacy.locationAddress, secret.locationAddress);
});

test('creating a session with a saved venue persists its details, including per-session edits', async () => {
	const { db, locals } = await fixture();
	await assert.rejects(
		createActions.create({
			locals,
			request: request({
				title: 'New meeting',
				status: 'draft',
				venueId: 'library',
				logisticsVenueId: 'library',
				locationName: 'Library annex',
				...secret,
				locationAddress: 'Annex address'
			})
		}),
		(error) => error.status === 303
	);
	const created = (await db.select().from(sessions)).find((item) => item.title === 'New meeting');
	assert.equal(created.locationName, 'Library annex');
	assert.equal(created.locationAddress, 'Annex address');
	assert.equal(created.venueId, 'library');
	assert.equal((await db.select().from(venues).get()).address, secret.locationAddress);
});

test('invalid joining URLs and meeting formats fail before persistence', () => {
	for (const joiningUrl of [
		'javascript:alert(1)',
		'data:text/html,test',
		'https://user:password@example.test',
		'bad-url'
	])
		assert.throws(() => parseLogistics(form({ joiningUrl })), /URL|HTTP/);
	assert.throws(() => parseLogistics(form({ meetingFormat: 'party' })), /format/);
	assert.throws(() => parseLogistics(form({ locationAddress: 'a'.repeat(2001) })), /too long/);
	assert.equal(parseLogistics(form({ locationName: 'Library' })).joiningUrl, null);
});

test('public API, anonymous RSVP, and cancellation page omit private logistics from serialized data', async () => {
	const { anonymous, load } = await fixture();
	const publicData = await (await publicApi({ locals: anonymous })).json();
	assert.equal(publicData[0].locationName, 'Bermuda National Library');
	assertPrivate(publicData, false);
	const page = await load();
	assertPrivate(page, false);
	assert.equal(page.logistics, null);
	assertPrivate(await cancelPage({ locals: anonymous, params: { token: 'guest-cancel' } }), false);
});

test('member and scoped confirmed guest access stops for invalid tokens, other sessions, waitlists, cancellations and inactive accounts', async () => {
	const { db, locals, participant, load } = await fixture();
	const guest = await participant();
	const member = await participant('member');
	assertPrivate(await load(null, locals), true);
	assertPrivate(await load(guest.calendarToken), true);
	assert.equal((await load(guest.calendarToken)).confirmedRegistration, true);
	assertPrivate(await load('a'.repeat(64)), false);
	assertPrivate(await load(guest.confirmationToken), false);
	await db.insert(sessions).values({
		id: 'other',
		slug: 'other',
		title: 'Other',
		status: 'scheduled',
		isPublic: true,
		...secret
	});
	assertPrivate(await load(guest.calendarToken, undefined, 'other'), false);
	for (const attendanceStatus of ['waitlisted', 'maybe', 'cancelled', 'declined']) {
		await db
			.update(sessionParticipants)
			.set({ attendanceStatus })
			.where(eq(sessionParticipants.id, 'guest'));
		assertPrivate(await load(guest.calendarToken), false);
	}
	await db.update(users).set({ status: 'suspended' }).where(eq(users.id, 'host'));
	assertPrivate(await load(null, locals), false);
	assertPrivate(await load(member.calendarToken), false);
	await db
		.update(sessionParticipants)
		.set({ attendanceStatus: 'attending' })
		.where(eq(sessionParticipants.id, 'guest'));
	await db.update(sessions).set({ isPublic: false }).where(eq(sessions.id, 'meeting'));
	assert.equal((await load()).session, null);
	assertPrivate(await load(guest.calendarToken), true);
	await db.update(sessions).set({ status: 'cancelled' }).where(eq(sessions.id, 'meeting'));
	assertPrivate(await load(guest.calendarToken), false);
});

test('confirmation, promotion, reminder and attendee emails expose details to eligible recipients', async () => {
	const { db, row, participant, sent, platform } = await fixture();
	const session = await row();
	const guest = await db
		.select()
		.from(attendeeIdentities)
		.where(eq(attendeeIdentities.id, 'guest'))
		.get();
	await sendRegistrationConfirmationEmail(
		platform,
		session,
		await participant(),
		guest,
		'https://example.test',
		db
	);
	assertPrivate(sent[0], true);
	assert.match(sent[0].html, /View on Google Maps/);
	const detailsUrl = sent[0].text.match(/Joining details: (\S+)/)[1];
	assert.equal(new URL(detailsUrl).searchParams.get('token'), (await participant()).calendarToken);
	assert.ok(decodeURIComponent(sent[0].text).includes(secret.locationAddress.split('\n')[0]));
	await sendWaitlistConfirmationEmail(
		platform,
		session,
		{ ...(await participant()), attendanceStatus: 'waitlisted' },
		guest,
		'https://example.test',
		db
	);
	assertPrivate(sent[1], false);
	await sendWaitlistPromotionEmail(
		platform,
		session,
		await participant(),
		guest,
		'https://example.test',
		db
	);
	assertPrivate(sent[2], true);
	const reminder = renderSessionReminderEmail(
		{
			...session,
			starts_at: session.startsAt,
			location_name: session.locationName,
			meeting_format: session.meetingFormat,
			location_address: session.locationAddress,
			joining_url: session.joiningUrl,
			accessibility_notes: session.accessibilityNotes
		},
		{ attendee_name: 'Guest', user_id: null, calendar_token: (await participant()).calendarToken }
	);
	assertPrivate(reminder, true);
	await sendSessionMessage({
		db,
		platform,
		session,
		senderUserId: 'host',
		audiences: ['attending'],
		subject: 'Update',
		bodySource: 'Check the details',
		kind: 'update'
	});
	assertPrivate(sent[3], true);
});

test('private calendar details follow RSVP eligibility and logistics changes increase the calendar revision', async () => {
	const { db, anonymous, participant } = await fixture();
	const p = await participant();
	const read = async () =>
		(await (await downloadSessionCalendar(anonymous, 'meeting', p.calendarToken)).text()).replace(
			/\r\n[ \t]/g,
			''
		);
	const confirmed = await read();
	assert.match(confirmed, /15 Private Lane/);
	assert.match(confirmed, /pwd=secret/);
	const sequence = (value) => Number(value.match(/SEQUENCE:(\d+)/)[1]);
	await db
		.update(sessions)
		.set({ locationAddress: 'Changed private address' })
		.where(eq(sessions.id, 'meeting'));
	assert.ok(sequence(await read()) > sequence(confirmed));
	await db
		.update(sessionParticipants)
		.set({ attendanceStatus: 'waitlisted' })
		.where(eq(sessionParticipants.id, 'guest'));
	assert.doesNotMatch(await read(), /Changed private address|pwd=secret|Side entrance/);
	await db
		.update(sessionParticipants)
		.set({ attendanceStatus: 'cancelled' })
		.where(eq(sessionParticipants.id, 'guest'));
	assert.doesNotMatch(await read(), /LOCATION:|pwd=secret|Side entrance/);
});

test('editing private logistics offers a prepared update without putting secrets in its draft or URL', async () => {
	const { locals, row } = await fixture();
	const current = await row();
	const result = await editActions.updateSession({
		locals,
		params: { slug: 'meeting' },
		request: request({
			expectedUpdatedAt: current.updatedAt,
			title: current.title,
			startsAt: current.startsAt,
			timezone: current.timezone,
			themeId: 'theme',
			venueId: 'library',
			locationName: current.locationName,
			...secret,
			locationAddress: 'Changed address'
		})
	});
	assert.equal(result.updated, true);
	assert.equal(result.previousDetails.logisticsChanged, true);
	assert.ok(result.detailChanges.some((change) => change.field === 'logistics'));
	assertPrivate(result, false);
	const draft = draftFromTemplate(
		await row(),
		new URLSearchParams({ template: 'update', logisticsChanged: 'yes' })
	);
	assert.match(draft.draft.body, /Joining details/);
	assertPrivate(draft, false);
});
