import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { database } from './database.mjs';
import {
	sessions,
	users,
	sessionParticipants,
	sessionSubjects,
	sessionReadingChoices,
	books,
	subjectSources,
	userProfiles,
	themes,
	threads
} from '../src/lib/server/db/schema.ts';
import {
	createClubSession,
	changeSessionStatus,
	sessionAccessCondition
} from '../src/lib/server/session-lifecycle.ts';
import {
	canAcceptSessionRsvps,
	sessionPublicationError,
	hasSessionEnded
} from '../shared/session-lifecycle.ts';
import {
	getOrCreatePublicAttendee,
	getOrCreateMemberAttendee,
	getCurrentUserSessionRsvp,
	setMemberRsvp,
	submitSessionRsvp,
	cancelParticipantByToken,
	RsvpCapacityError
} from '../src/lib/server/rsvp.ts';
import {
	threadAccessCondition,
	threadAccessSql,
	threadAccessBindings
} from '../src/lib/server/thread-access.ts';
import { GET as publicSessions } from '../src/routes/api/v1/sessions/+server.ts';
import { GET as publicSubjects } from '../src/routes/api/v1/sessions/[id]/subjects/+server.ts';
import {
	load as sessionPage,
	actions as sessionActions
} from '../src/routes/sessions/[slug]/+page.server.ts';
import { load as membersPage } from '../src/routes/members/+page.server.ts';
import { actions as adminMemberActions } from '../src/routes/admin/members/+page.server.ts';
import { load as homePage } from '../src/routes/+page.server.ts';
import { load as themesPage } from '../src/routes/themes/+page.server.ts';
import { actions as publicRsvp } from '../src/routes/rsvp/[eventSlug]/+page.server.ts';
import { actions as adminCreate } from '../src/routes/admin/sessions/+page.server.ts';
import { actions as adminEdit } from '../src/routes/admin/sessions/[slug]/+page.server.ts';
import { actions as threadActions } from '../src/routes/thread/[slug]/+page.server.ts';
import { GET as calendarEvent } from '../src/routes/sessions/[slug]/calendar.ics/+server.ts';
import { runSessionReminders } from '../workers/storied-worker/src/notifications/scheduled-session-reminders.ts';

async function fixture() {
	const context = database();
	const { db } = context;
	await db.insert(themes).values({ id: 'theme', slug: 'theme', name: 'Test theme' });
	await db
		.insert(users)
		.values({ id: 'host', email: 'host@example.test', displayName: 'Host', role: 'admin' });
	await db
		.insert(users)
		.values({ id: 'reader', email: 'reader@example.test', displayName: 'Reader' });
	const reader = await db.select().from(users).where(eq(users.id, 'reader')).get();
	const sent = [];
	const platform = {
		env: {
			SEND_EMAILS: true,
			EMAIL: {
				send: async (message) => {
					sent.push(message);
				}
			}
		}
	};
	const locals = { db, user: reader, permissions: new Set(['access:general']) };
	const addSession = async (id, extra = {}) => {
		await createClubSession(
			db,
			{
				id,
				slug: id,
				title: id,
				themeId: 'theme',
				startsAt: '2099-10-01T18:00',
				timezone: 'UTC',
				status: 'scheduled',
				rsvpCapacity: 1,
				isPublic: true,
				...extra
			},
			'host',
			null
		);
		return db.select().from(sessions).where(eq(sessions.id, id)).get();
	};
	return { ...context, reader, sent, platform, locals, addSession };
}

test('drafts can omit date and theme; upcoming requires only a date', () => {
	assert.equal(sessionPublicationError({ startsAt: null, themeId: null, status: 'draft' }), null);
	assert.match(
		sessionPublicationError({ startsAt: null, themeId: 'theme', status: 'current' }),
		/date/
	);
	assert.match(
		sessionPublicationError({ startsAt: '2099-01-01T18:00', themeId: null, status: 'current' }),
		/theme/
	);
	assert.match(
		sessionPublicationError({ startsAt: null, themeId: null, status: 'scheduled' }),
		/date/
	);
	assert.equal(
		sessionPublicationError({ startsAt: '2099-01-01T18:00', themeId: null, status: 'scheduled' }),
		null
	);
	assert.match(
		sessionPublicationError({ startsAt: '2099-01-01T18:00', themeId: null, status: 'past' }),
		/theme/
	);
	for (const status of ['draft', 'past', 'cancelled'])
		assert.equal(
			canAcceptSessionRsvps({ status, startsAt: '2099-01-01T18:00', timezone: 'UTC' }),
			false
		);
	for (const status of ['scheduled', 'current']) {
		assert.equal(
			canAcceptSessionRsvps({ status, startsAt: '2099-01-01T18:00', timezone: 'UTC' }),
			true
		);
		assert.equal(
			canAcceptSessionRsvps({
				status,
				startsAt: '2099-01-01T18:00',
				timezone: 'UTC',
				rsvpEnabled: false
			}),
			false
		);
	}
	assert.equal(
		canAcceptSessionRsvps(
			{ status: 'current', startsAt: '2026-09-05T18:00', timezone: 'Atlantic/Bermuda' },
			new Date('2026-09-05T22:00:00Z')
		),
		false
	);
	assert.equal(
		hasSessionEnded(
			{ startsAt: '2026-09-05T18:00', timezone: 'Atlantic/Bermuda', durationMinutes: 90 },
			new Date('2026-09-05T22:00:00Z')
		),
		false
	);
});

test('creating the next current session preserves future registrations and untouched drafts', async () => {
	const { db, addSession } = await fixture();
	await addSession('old', { status: 'current' });
	await addSession('draft', { status: 'draft', startsAt: null, themeId: null });
	await addSession('next', { status: 'current', startsAt: '2099-11-01T18:00' });
	assert.equal(
		(await db.select().from(sessions).where(eq(sessions.id, 'old')).get()).status,
		'scheduled'
	);
	assert.equal(
		(await db.select().from(sessions).where(eq(sessions.id, 'draft')).get()).status,
		'draft'
	);
	assert.equal(
		(await db.select().from(themes).where(eq(themes.id, 'theme')).get()).status,
		'selected'
	);
	assert.equal(
		(await db.select().from(threads).where(eq(threads.sessionId, 'next')).all()).length,
		1
	);
});

test('a completed current session becomes past; failed creation rolls the transition back', async () => {
	const { db, addSession } = await fixture();
	await addSession('old', { status: 'current', startsAt: '2000-01-01T18:00' });
	await assert.rejects(
		createClubSession(
			db,
			{
				id: 'broken',
				slug: 'broken',
				title: 'Broken',
				status: 'current',
				themeId: 'theme',
				startsAt: '2099-01-01T18:00'
			},
			'missing-host',
			null
		)
	);
	assert.equal(
		(await db.select().from(sessions).where(eq(sessions.id, 'old')).get()).status,
		'current'
	);
	assert.equal(await db.select().from(sessions).where(eq(sessions.id, 'broken')).get(), undefined);
	await addSession('next', { status: 'current' });
	assert.equal(
		(await db.select().from(sessions).where(eq(sessions.id, 'old')).get()).status,
		'past'
	);
});

test('promoting a draft is atomic and stale submissions do not change the current session', async () => {
	const { db, addSession } = await fixture();
	await addSession('old', { status: 'current' });
	const draft = await addSession('next', { status: 'draft' });
	await db.update(sessions).set({ updatedAt: 'changed' }).where(eq(sessions.id, 'next'));
	const stale = await changeSessionStatus(db, draft, 'current');
	assert.match(stale.error, /changed/);
	assert.equal(
		(await db.select().from(sessions).where(eq(sessions.id, 'old')).get()).status,
		'current'
	);
	const fresh = await db.select().from(sessions).where(eq(sessions.id, 'next')).get();
	assert.equal((await changeSessionStatus(db, fresh, 'current')).error, null);
	assert.equal(
		(await db.select().from(sessions).where(eq(sessions.status, 'current')).all()).length,
		1
	);
});

test('member confirmations, duplicate submissions, and public-to-member waitlist identity share one record', async () => {
	const { db, reader, platform, sent, addSession } = await fixture();
	const session = await addSession('meeting');
	const guest = await getOrCreatePublicAttendee(db, 'Guest', 'guest@example.test');
	await submitSessionRsvp({
		db,
		platform,
		baseUrl: 'https://club.example.test',
		session,
		attendee: guest,
		response: 'attending',
		source: 'public_form'
	});
	const guestReader = await getOrCreatePublicAttendee(db, 'Reader', ' READER@example.test ');
	await submitSessionRsvp({
		db,
		platform,
		baseUrl: 'https://club.example.test',
		session,
		attendee: guestReader,
		response: 'attending',
		source: 'public_form'
	});
	assert.equal(
		(await getCurrentUserSessionRsvp(db, session.id, reader.id)).attendanceStatus,
		'waitlisted'
	);
	assert.equal(sent.length, 2);
	assert.match(sent[1].subject, /Waitlisted/);
	const result = await setMemberRsvp({ db, platform, user: reader, session, status: 'registered' });
	assert.equal(result.status, 'waitlisted');
	assert.equal(sent.length, 2, 'a duplicate does not send a fresh confirmation');
	assert.equal(
		(
			await db
				.select()
				.from(sessionParticipants)
				.where(eq(sessionParticipants.sessionId, session.id))
				.all()
		).length,
		2
	);
	const linked = await getOrCreateMemberAttendee(db, reader);
	assert.equal(linked.id, guestReader.id);
});

test('member receives a confirmation with a cancellation link, and cancellation promotes the waitlist', async () => {
	const { db, reader, platform, sent, addSession } = await fixture();
	const session = await addSession('meeting', { durationMinutes: 90 });
	const confirmed = await setMemberRsvp({
		db,
		platform,
		user: reader,
		session,
		status: 'registered'
	});
	assert.equal(confirmed.status, 'registered');
	assert.equal(sent.length, 1);
	assert.match(sent[0].subject, /confirmed/);
	assert.match(sent[0].html, /\/cancel\//);
	assert.match(sent[0].html, /calendar\.google\.com/);
	assert.match(sent[0].html, /calendar\.yahoo\.com/);
	assert.match(sent[0].html, /ms-outlook:\/\/events\/new/);
	assert.match(sent[0].html, /outlook\.live\.com/);
	assert.match(sent[0].html, /calendar\.ics/);
	const guest = await getOrCreatePublicAttendee(db, 'Guest', 'guest@example.test');
	await submitSessionRsvp({
		db,
		platform,
		baseUrl: 'https://club.example.test',
		session,
		attendee: guest,
		response: 'attending',
		source: 'public_form'
	});
	await setMemberRsvp({ db, platform, user: reader, session, status: 'declined' });
	assert.equal(sent.length, 3);
	assert.match(sent[2].subject, /spot opened/);
	const memberRsvp = await getCurrentUserSessionRsvp(db, session.id, reader.id);
	assert.equal(memberRsvp.attendanceStatus, 'declined');
	await setMemberRsvp({ db, platform, user: reader, session, status: 'registered' });
	assert.equal(
		(await getCurrentUserSessionRsvp(db, session.id, reader.id)).attendanceStatus,
		'waitlisted'
	);
	assert.match(sent.at(-1).subject, /Waitlisted/);
	const cancelled = await cancelParticipantByToken(db, memberRsvp.confirmationToken);
	assert.equal(cancelled.participant.attendanceStatus, 'cancelled');
});

test('capacity without waitlist rejects both entry points; email failure preserves a valid RSVP', async () => {
	const { db, reader, platform, addSession } = await fixture();
	const session = await addSession('meeting', { rsvpWaitlistEnabled: false });
	platform.env.EMAIL.send = async () => {
		throw new Error('Simulated delivery failure');
	};
	const result = await setMemberRsvp({ db, platform, user: reader, session, status: 'registered' });
	assert.equal(result.status, 'registered');
	assert.equal(result.confirmationEmailFailed, true);
	assert.equal(
		(await getCurrentUserSessionRsvp(db, session.id, reader.id)).attendanceStatus,
		'attending'
	);
	const guest = await getOrCreatePublicAttendee(db, 'Guest', 'guest@example.test');
	await assert.rejects(
		submitSessionRsvp({
			db,
			platform,
			baseUrl: 'https://club.example.test',
			session,
			attendee: guest,
			response: 'attending',
			source: 'public_form'
		}),
		RsvpCapacityError
	);
	assert.match((await changeSessionStatus(db, session, 'draft')).error, /registrations/);
});

test('drafts stay out of member Home, theme links, session details, public API, and discussions', async () => {
	const { db, locals, addSession } = await fixture();
	await addSession('secret', { status: 'draft' });
	const published = await addSession('visible');
	const list = await db.select().from(sessions).where(sessionAccessCondition(locals)).all();
	assert.deepEqual(
		list.map((x) => x.id),
		['visible']
	);
	const viewer = {
		userId: 'reader',
		canModerate: false,
		canManageGroups: false,
		canManageSessions: false
	};
	const visible = await db.select().from(threads).where(threadAccessCondition(db, viewer)).all();
	assert.deepEqual(
		visible.map((x) => x.sessionId),
		['visible']
	);
	const raw = await db.$client
		.prepare(`SELECT t.session_id FROM threads t WHERE ${threadAccessSql()}`)
		.bind(...threadAccessBindings(viewer))
		.all();
	assert.deepEqual(
		raw.results.map((x) => x.session_id),
		['visible']
	);
	assert.equal((await homePage({ locals })).currentSession.id, published.id);
	assert.deepEqual(
		(await themesPage({ locals })).sessions.map((x) => x.id),
		['visible']
	);
	await assert.rejects(
		sessionPage({ params: { slug: 'secret' }, locals }),
		(error) => error.status === 404
	);
	const api = await (await publicSessions({ locals })).json();
	assert.deepEqual(
		api.map((x) => x.id),
		['visible']
	);
	assert.equal(api[0].rsvpSlug, 'visible');
	await assert.rejects(
		publicSubjects({ params: { id: 'secret' }, locals }),
		(error) => error.status === 404
	);
	const admin = { ...viewer, canModerate: true, canManageSessions: true };
	assert.equal(
		(await db.select().from(threads).where(threadAccessCondition(db, admin)).all()).length,
		2
	);
});

test('public standalone duplicate responses retain the actual waitlist status', async () => {
	const { db, locals, platform, sent, reader, addSession } = await fixture();
	const session = await addSession('meeting');
	await setMemberRsvp({ db, platform, user: reader, session, status: 'registered' });
	const request = () =>
		new Request('https://club.example.test/rsvp/meeting', {
			method: 'POST',
			body: new URLSearchParams({ name: 'Guest', email: 'guest@example.test' })
		});
	for (let attempt = 0; attempt < 2; attempt++) {
		await assert.rejects(
			publicRsvp.default({
				request: request(),
				params: { eventSlug: 'meeting' },
				locals,
				platform,
				url: new URL(request().url)
			}),
			(error) => error.status === 303 && error.location.includes('status=waitlisted')
		);
	}
	assert.equal(sent.length, 2);
});

test('reminders include scheduled meetings, members and guests, exclude drafts and waitlists, and deduplicate', async () => {
	const { db, binding, reader, platform, sent, addSession } = await fixture();
	const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10) + 'T18:00';
	const current = await addSession('meeting', {
		startsAt: tomorrow,
		timezone: 'UTC',
		status: 'current',
		rsvpCapacity: 2
	});
	const upcoming = await addSession('upcoming', { startsAt: tomorrow, timezone: 'UTC' });
	await setMemberRsvp({ db, platform, user: reader, session: current, status: 'registered' });
	const guest = await getOrCreatePublicAttendee(db, 'Guest', 'guest@example.test');
	await submitSessionRsvp({
		db,
		platform,
		baseUrl: 'https://club.example.test',
		session: current,
		attendee: guest,
		response: 'attending',
		source: 'public_form'
	});
	await setMemberRsvp({ db, platform, user: reader, session: upcoming, status: 'registered' });
	const waitlisted = await getOrCreatePublicAttendee(db, 'Waitlisted', 'waitlisted@example.test');
	await submitSessionRsvp({
		db,
		platform,
		baseUrl: 'https://club.example.test',
		session: upcoming,
		attendee: waitlisted,
		response: 'attending',
		source: 'public_form'
	});
	await addSession('draft', { startsAt: tomorrow, status: 'draft' });
	sent.length = 0;
	const context = { env: { ...platform.env, DB: binding } };
	await runSessionReminders(context);
	assert.equal(sent.length, 3);
	assert.equal(
		sent.some((message) => message.to === 'waitlisted@example.test'),
		false
	);
	await runSessionReminders(context);
	assert.equal(sent.length, 3);
});

test('members can cancel an existing place while new registrations are paused', async () => {
	const { db, reader, platform, addSession } = await fixture();
	const session = await addSession('meeting');
	await setMemberRsvp({ db, platform, user: reader, session, status: 'registered' });
	await db.update(sessions).set({ rsvpEnabled: false }).where(eq(sessions.id, session.id));
	const paused = { ...session, rsvpEnabled: false };
	assert.equal(
		(await setMemberRsvp({ db, platform, user: reader, session: paused, status: 'declined' }))
			.status,
		'declined'
	);
	assert.equal(
		(await getCurrentUserSessionRsvp(db, session.id, reader.id)).attendanceStatus,
		'declined'
	);
	assert.equal(
		(await setMemberRsvp({ db, platform, user: reader, session: paused, status: 'registered' }))
			.status,
		400
	);
});

const formRequest = (fields) =>
	new Request('https://club.example.test/admin/sessions', {
		method: 'POST',
		body: new URLSearchParams(fields)
	});

test('admin can create an undated draft, complete its details, and publish it', async () => {
	const { db, locals } = await fixture();
	locals.user = await db.select().from(users).where(eq(users.id, 'host')).get();
	locals.permissions = new Set(['sessions:edit']);
	await assert.rejects(
		adminCreate.create({
			locals,
			request: formRequest({ title: 'Next Meeting', status: 'draft' })
		}),
		(error) => error.status === 303 && error.location.startsWith('/admin/sessions/next-meeting-')
	);
	let session = await db.select().from(sessions).where(eq(sessions.status, 'draft')).get();
	assert.equal(session.startsAt, null);
	assert.equal(session.themeId, null);
	const params = { slug: session.slug };
	assert.equal(
		(
			await adminEdit.updateStatus({
				locals,
				params,
				request: formRequest({ expectedUpdatedAt: session.updatedAt, status: 'current' })
			})
		).status,
		400
	);
	const edit = await adminEdit.updateSession({
		locals,
		params,
		request: formRequest({
			expectedUpdatedAt: session.updatedAt,
			title: 'Next Meeting',
			themeId: 'theme',
			startsAt: '2099-11-01T18:00',
			timezone: 'Atlantic/Bermuda',
			rsvpEnabled: 'on'
		})
	});
	assert.equal(edit.updated, true);
	assert.equal((await db.select().from(themes).where(eq(themes.id, 'theme')).get()).status, 'idea');
	session = await db.select().from(sessions).where(eq(sessions.id, session.id)).get();
	assert.equal(
		(
			await adminEdit.updateStatus({
				locals,
				params,
				request: formRequest({ expectedUpdatedAt: session.updatedAt, status: 'current' })
			})
		).statusUpdated,
		true
	);
	session = await db.select().from(sessions).where(eq(sessions.id, session.id)).get();
	assert.equal(session.status, 'current');
	assert.equal(canAcceptSessionRsvps(session), true);
	assert.equal(
		(await db.select().from(themes).where(eq(themes.id, 'theme')).get()).status,
		'selected'
	);
});

test('admin can publish a dated upcoming session without choosing a theme', async () => {
	const { db, locals } = await fixture();
	locals.user = await db.select().from(users).where(eq(users.id, 'host')).get();
	locals.permissions = new Set(['sessions:edit']);

	const missingDate = await adminCreate.create({
		locals,
		request: formRequest({ title: 'Future Meeting', status: 'scheduled' })
	});
	assert.equal(missingDate.status, 400);

	await assert.rejects(
		adminCreate.create({
			locals,
			request: formRequest({
				title: 'Future Meeting',
				status: 'scheduled',
				startsAt: '2099-12-01T18:00',
				timezone: 'Atlantic/Bermuda',
				rsvpEnabled: 'on'
			})
		}),
		(error) => error.status === 303 && error.location.startsWith('/admin/sessions/future-meeting')
	);

	const session = await db.select().from(sessions).where(eq(sessions.status, 'scheduled')).get();
	assert.equal(session.themeId, null);
	assert.equal(canAcceptSessionRsvps(session), true);
});

test('a member with an RSVP can download the session calendar event', async () => {
	const { db, locals, reader, platform, addSession } = await fixture();
	const session = await addSession('calendar', {
		durationMinutes: 90,
		locationName: 'Bermuda National Library'
	});
	await setMemberRsvp({ db, platform, user: reader, session, status: 'registered' });

	const response = await calendarEvent({
		locals,
		params: { slug: session.slug },
		url: new URL(`https://archive.example.test/sessions/${session.slug}/calendar.ics`)
	});
	const calendar = await response.text();
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('content-type'), 'text/calendar; charset=utf-8');
	assert.match(response.headers.get('content-disposition'), /attachment/);
	assert.match(calendar, /SUMMARY:Bermuda Triangle Society Meeting/);
	assert.match(calendar, /DURATION:PT90M/);
	assert.match(calendar, /LOCATION:Bermuda National Library/);
});

test('a member can record a session reading choice without creating attendance', async () => {
	const { db, locals, addSession } = await fixture();
	const session = await addSession('reading-choice');
	await db.insert(books).values({ id: 'book', slug: 'book', title: 'The Book' });

	const result = await sessionActions.upsertReadingChoice({
		locals,
		params: { slug: session.slug },
		request: formRequest({
			bookId: 'book',
			readingStatus: 'planned'
		})
	});

	assert.equal(result.readingChoiceSaved, true);
	assert.equal(await db.$count(sessionParticipants), 0);
	const choice = await db.select().from(sessionReadingChoices).get();
	assert.equal(choice.sessionId, session.id);
	assert.equal(choice.readingStatus, 'planned');
	assert.equal(choice.bookId, 'book');

	await db.insert(books).values({ id: 'replacement', slug: 'replacement', title: 'Replacement' });
	const edited = await sessionActions.upsertReadingChoice({
		locals,
		params: { slug: session.slug },
		request: formRequest({
			bookId: 'replacement',
			previousBookId: 'book',
			readingStatus: 'finished'
		})
	});
	assert.equal(edited.readingChoiceSaved, true);
	const editedChoice = await db.select().from(sessionReadingChoices).get();
	assert.equal(editedChoice.readingStatus, 'finished');
	assert.equal(editedChoice.bookId, 'replacement');
	assert.equal(await db.$count(sessionReadingChoices), 1);

	const page = await sessionPage({
		locals,
		params: { slug: session.slug },
		platform: undefined,
		depends: () => {}
	});
	assert.equal(page.myReadingChoices.length, 1);
	assert.equal(page.readingChoices[0].subject.title, 'Replacement');

	await db.insert(books).values({ id: 'url-book', slug: 'url-book', title: 'The URL Book' });
	await db.insert(subjectSources).values({
		id: 'book-source',
		sourceType: 'goodreads',
		sourceUrl: 'https://www.goodreads.com/book/show/123',
		sourceKey: '123',
		subjectType: 'book',
		subjectId: 'url-book',
		fetchStatus: 'resolved'
	});
	const urlResult = await sessionActions.upsertReadingChoice({
		locals,
		params: { slug: session.slug },
		platform: undefined,
		request: formRequest({
			url: 'https://www.goodreads.com/book/show/123',
			previousBookId: 'replacement',
			readingStatus: 'reading'
		})
	});
	assert.equal(urlResult.readingChoiceSaved, true);
	assert.equal(await db.$count(sessionReadingChoices), 1);
	assert.equal((await db.select().from(sessionReadingChoices).get()).bookId, 'url-book');
	assert.equal(await db.$count(sessionParticipants), 0);

	const adminLocals = {
		db,
		user: await db.select().from(users).where(eq(users.id, 'host')).get(),
		permissions: new Set(['sessions:edit'])
	};
	const promoted = await adminEdit.promoteReadingChoice({
		locals: adminLocals,
		params: { slug: session.slug },
		request: formRequest({ bookId: 'url-book' })
	});
	assert.equal(promoted.readingChoicePromoted, true);
	const featured = await db.select().from(sessionSubjects).get();
	assert.equal(featured.subjectId, 'url-book');
	assert.equal(featured.status, 'featured');
});

test('active members are listed by default and the admin visibility control is authoritative', async () => {
	const { db, locals } = await fixture();
	let page = await membersPage({ locals });
	assert.deepEqual(page.members.map((member) => member.id).sort(), ['host', 'reader']);

	const adminLocals = {
		db,
		user: await db.select().from(users).where(eq(users.id, 'host')).get(),
		permissions: new Set(['members:edit'])
	};
	const hidden = await adminMemberActions.updateMemberListVisibility({
		locals: adminLocals,
		request: formRequest({ userId: 'reader', showInMemberList: 'false' })
	});
	assert.equal(hidden.visibilityUpdated, true);
	assert.equal(
		(await db.select().from(userProfiles).where(eq(userProfiles.userId, 'reader')).get())
			.showInMemberList,
		false
	);

	page = await membersPage({ locals });
	assert.equal(
		page.members.some((member) => member.id === 'reader'),
		false
	);
	assert.equal(page.isCurrentUserListed, false);
});

test('a concurrent details save reports conflict without selecting the unsaved theme', async () => {
	const { db, locals, addSession } = await fixture();
	const session = await addSession('meeting');
	await db.insert(themes).values({ id: 'other', slug: 'other', name: 'Other' });
	locals.permissions = new Set(['sessions:edit']);
	const batch = db.batch.bind(db);
	db.batch = async (statements) => {
		await db
			.update(sessions)
			.set({ updatedAt: 'concurrent-edit', title: 'Newer title' })
			.where(eq(sessions.id, session.id));
		return batch(statements);
	};
	const result = await adminEdit.updateSession({
		locals,
		params: { slug: session.slug },
		request: formRequest({
			expectedUpdatedAt: session.updatedAt,
			title: 'Stale title',
			themeId: 'other',
			startsAt: session.startsAt,
			timezone: 'Atlantic/Bermuda'
		})
	});
	assert.equal(result.status, 409);
	assert.equal(
		(await db.select().from(sessions).where(eq(sessions.id, session.id)).get()).title,
		'Newer title'
	);
	assert.equal((await db.select().from(themes).where(eq(themes.id, 'other')).get()).status, 'idea');
});

test('a moderator without session permission cannot expose a private draft discussion', async () => {
	const { db, locals, addSession } = await fixture();
	await addSession('secret', { status: 'draft' });
	const thread = await db.select().from(threads).where(eq(threads.sessionId, 'secret')).get();
	locals.permissions = new Set(['moderate']);
	const result = await threadActions.linkSession({
		locals,
		params: { slug: thread.slug },
		request: formRequest({ sessionId: '' })
	});
	assert.equal(result.status, 403);
	assert.equal(
		(await db.select().from(threads).where(eq(threads.id, thread.id)).get()).sessionId,
		'secret'
	);
});

test('lifecycle migration preserves existing sessions and resolves multiple current sessions', () => {
	const { sqlite } = database('0026');
	sqlite.exec(
		"INSERT INTO sessions (id,slug,title,status,starts_at) VALUES ('older','older','Older','current','2026-09-01T18:00'),('newer','newer','Newer','current','2026-10-01T18:00'),('draft','draft','Draft','draft',NULL)"
	);
	sqlite.exec(readFileSync('migrations/0026_session_lifecycle.sql', 'utf8'));
	assert.equal(
		sqlite.prepare("SELECT status FROM sessions WHERE id='older'").get().status,
		'scheduled'
	);
	assert.equal(
		sqlite.prepare("SELECT status FROM sessions WHERE id='newer'").get().status,
		'current'
	);
	assert.equal(
		sqlite.prepare("SELECT status FROM sessions WHERE id='draft'").get().status,
		'draft'
	);
	assert.equal(
		sqlite.prepare('SELECT count(*) AS count FROM sessions WHERE rsvp_enabled=1').get().count,
		3
	);
	assert.throws(
		() => sqlite.exec("UPDATE sessions SET status='current' WHERE id='draft'"),
		/UNIQUE/
	);
	assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
	sqlite.close();
});

test('session discussion category migration supplies the thread foreign key parent', () => {
	const { sqlite } = database('0027');
	assert.equal(
		sqlite
			.prepare("SELECT count(*) AS count FROM categories WHERE id='cat_session_discussions'")
			.get().count,
		0
	);
	sqlite.exec(readFileSync('migrations/0027_session_discussions_category.sql', 'utf8'));
	assert.deepEqual(
		{
			...sqlite
				.prepare("SELECT id, slug, name FROM categories WHERE id='cat_session_discussions'")
				.get()
		},
		{
			id: 'cat_session_discussions',
			slug: 'session-discussions',
			name: 'Sessions'
		}
	);
	assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
	sqlite.close();
});
