import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { database } from './database.mjs';
import {
	sessionAgendaItems,
	sessionAttendance,
	sessionParticipants,
	sessions,
	themes,
	users
} from '../src/lib/server/db/schema.ts';
import { createClubSession } from '../src/lib/server/session-lifecycle.ts';
import { getOrCreateAdminAttendee, upsertAdminParticipation } from '../src/lib/server/rsvp.ts';
import {
	acceptAgendaSuggestion,
	canGiveFeedback,
	createAgendaItem,
	createDefaultAgendaItem,
	endLiveSession,
	getSessionAgenda,
	markPresent,
	markUnrecordedExpectedAbsent,
	moveAgendaItem,
	startLiveSession,
	submitAgendaSuggestion,
	workflowPhase
} from '../src/lib/server/session-workflow.ts';
import {
	actions as runActions,
	load as runPage
} from '../src/routes/sessions/[slug]/run/+page.server.ts';
import { actions as recapActions } from '../src/routes/sessions/[slug]/recap/+page.server.ts';
import {
	actions as feedbackActions,
	load as feedbackPage
} from '../src/routes/sessions/[slug]/feedback/+page.server.ts';
import {
	actions as sessionActions,
	load as sessionPage
} from '../src/routes/sessions/[slug]/+page.server.ts';
import { GET as publicSessions } from '../src/routes/api/v1/sessions/+server.ts';

async function fixture() {
	const context = database();
	const { db } = context;
	await db.insert(themes).values({ id: 'theme', slug: 'theme', name: 'Test theme' });
	await db.insert(users).values([
		{ id: 'host', email: 'host@example.test', displayName: 'Host', role: 'admin' },
		{ id: 'reader', email: 'reader@example.test', displayName: 'Reader' }
	]);
	const host = await db.select().from(users).where(eq(users.id, 'host')).get();
	const reader = await db.select().from(users).where(eq(users.id, 'reader')).get();
	const facilitator = {
		db,
		user: host,
		permissions: new Set(['access:general', 'sessions:edit', 'sessions:facilitate', 'admin:view'])
	};
	const member = { db, user: reader, permissions: new Set(['access:general']) };
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
				...extra
			},
			'host',
			null
		);
		return db.select().from(sessions).where(eq(sessions.id, id)).get();
	};
	const rsvp = async (session, name, email, status = 'attending') => {
		const attendee = await getOrCreateAdminAttendee(db, { name, email });
		await upsertAdminParticipation({ db, session, attendee, status, note: null });
		return attendee;
	};
	return { ...context, host, reader, facilitator, member, addSession, rsvp };
}

const formRequest = (fields) =>
	new Request('https://club.example.test/x', { method: 'POST', body: new URLSearchParams(fields) });

test('migration turns historical outcomes into attendance and keeps the RSVP intent', () => {
	const { sqlite } = database('0030');
	sqlite.exec(
		"INSERT INTO sessions (id,slug,title,status,starts_at) VALUES ('old','old','Old','past','2020-01-01T18:00')"
	);
	sqlite.exec(
		"INSERT INTO attendee_identities (id,name) VALUES ('a','Ada'),('b','Bea'),('c','Cy')"
	);
	sqlite.exec(
		"INSERT INTO session_participants (id,session_id,attendee_id,name_snapshot,attendance_status) VALUES ('p1','old','a','Ada','attended'),('p2','old','b','Bea','no_show'),('p3','old','c','Cy','declined')"
	);
	sqlite.exec(readFileSync('migrations/0030_session_workflow.sql', 'utf8'));
	const rsvps = sqlite
		.prepare('SELECT attendee_id, attendance_status FROM session_participants ORDER BY attendee_id')
		.all();
	assert.deepEqual(
		rsvps.map((row) => row.attendance_status),
		['attending', 'attending', 'declined']
	);
	const attendance = sqlite
		.prepare('SELECT attendee_id, status FROM session_attendance ORDER BY attendee_id')
		.all();
	assert.deepEqual(
		attendance.map((row) => [row.attendee_id, row.status]),
		[
			['a', 'present'],
			['b', 'absent']
		]
	);
	assert.equal(sqlite.prepare('SELECT count(*) AS n FROM default_agenda_items').get().n, 4);
});

test('new sessions get an independent copy of the default agenda', async () => {
	const { db, addSession } = await fixture();
	const first = await addSession('first');
	const firstAgenda = await db
		.select()
		.from(sessionAgendaItems)
		.where(eq(sessionAgendaItems.sessionId, first.id))
		.all();
	assert.equal(firstAgenda.length, 4);
	assert.equal(firstAgenda[0].title, 'Welcome and announcements');
	assert.ok(firstAgenda.every((item) => item.status === 'ready' && item.source === 'facilitator'));

	await createDefaultAgendaItem(db, { title: 'Snack rota', visibility: 'facilitator' });
	const second = await addSession('second');
	const secondAgenda = await db
		.select()
		.from(sessionAgendaItems)
		.where(eq(sessionAgendaItems.sessionId, second.id))
		.all();
	assert.equal(secondAgenda.length, 5);
	assert.equal(
		(
			await db
				.select()
				.from(sessionAgendaItems)
				.where(eq(sessionAgendaItems.sessionId, first.id))
				.all()
		).length,
		4
	);
});

test('members see only accepted member-visible items plus their own pending suggestions', async () => {
	const { db, addSession, member } = await fixture();
	const session = await addSession('meeting');
	await createAgendaItem(db, session.id, { title: 'Secret prompt', visibility: 'facilitator' });
	const suggestion = await submitAgendaSuggestion(db, session.id, 'reader', {
		title: 'Shorter themes?'
	});
	await submitAgendaSuggestion(db, session.id, 'host', { title: 'Host idea' });

	const viewer = { userId: 'reader', canFacilitate: false };
	let visible = await getSessionAgenda(db, session.id, viewer);
	assert.ok(!visible.some((item) => item.title === 'Secret prompt'));
	assert.ok(!visible.some((item) => item.title === 'Host idea'));
	assert.ok(visible.some((item) => item.id === suggestion.id && item.status === 'pending'));

	await acceptAgendaSuggestion(db, session.id, suggestion.id, { title: 'Try shorter themes' });
	visible = await getSessionAgenda(db, session.id, viewer);
	const accepted = visible.find((item) => item.id === suggestion.id);
	assert.equal(accepted.status, 'ready');
	assert.equal(accepted.title, 'Try shorter themes');
	assert.equal(accepted.source, 'member');

	const all = await getSessionAgenda(db, session.id, { userId: 'host', canFacilitate: true });
	assert.equal(all.length, 7);

	await moveAgendaItem(db, session.id, suggestion.id, 'up');
	const reordered = await getSessionAgenda(db, session.id, { userId: 'host', canFacilitate: true });
	const listed = reordered.filter((item) => item.status !== 'pending');
	assert.ok(
		listed.findIndex((item) => item.id === suggestion.id) <
			listed.findIndex((item) => item.title === 'Secret prompt')
	);

	const page = await sessionPage({
		locals: member,
		params: { slug: 'meeting' },
		platform: undefined,
		depends: () => {}
	});
	assert.equal(page.agenda.length, 5);
	assert.equal(page.canFacilitate, false);
	const result = await sessionActions.suggestAgendaItem({
		locals: member,
		params: { slug: 'meeting' },
		request: formRequest({ title: 'Audiobook corner' })
	});
	assert.equal(result.agendaSuggested, true);
});

test('the runner records attendance without touching RSVPs and ends with optional absences', async () => {
	const { db, addSession, rsvp, facilitator } = await fixture();
	const session = await addSession('meeting');
	const ada = await rsvp(session, 'Ada', 'ada@example.test', 'attending');
	const bea = await rsvp(session, 'Bea', 'bea@example.test', 'attending');
	await rsvp(session, 'Cy', 'cy@example.test', 'maybe');

	assert.equal(workflowPhase(session), 'prepare');
	await startLiveSession(db, session.id);
	let row = await db.select().from(sessions).where(eq(sessions.id, session.id)).get();
	assert.equal(workflowPhase(row), 'run');

	await runActions.attendance({
		locals: facilitator,
		params: { slug: 'meeting' },
		request: formRequest({ attendeeId: ada.id, outcome: 'present' })
	});
	await runActions.addAttendee({
		locals: facilitator,
		params: { slug: 'meeting' },
		request: formRequest({ guestName: 'Walk-in Wes' })
	});
	const page = await runPage({ locals: facilitator, params: { slug: 'meeting' } });
	assert.equal(page.roster.find((r) => r.attendeeId === ada.id).attendance, 'present');
	assert.equal(page.roster.find((r) => r.attendeeId === bea.id).attendance, null);
	assert.ok(
		page.roster.some(
			(r) => r.name === 'Walk-in Wes' && r.rsvp === null && r.attendance === 'present'
		)
	);

	const ended = await runActions.endLive({
		locals: facilitator,
		params: { slug: 'meeting' },
		request: formRequest({ markRemainingAbsent: 'on' })
	});
	assert.equal(ended.markedAbsent, 1);
	row = await db.select().from(sessions).where(eq(sessions.id, session.id)).get();
	assert.equal(workflowPhase(row), 'recap');
	const beaAttendance = await db
		.select()
		.from(sessionAttendance)
		.where(eq(sessionAttendance.attendeeId, bea.id))
		.get();
	assert.equal(beaAttendance.status, 'absent');
	const rsvps = await db.select().from(sessionParticipants).all();
	assert.deepEqual(rsvps.map((p) => p.attendanceStatus).sort(), [
		'attending',
		'attending',
		'maybe'
	]);
	const memberView = await sessionPage({
		locals: { db, user: null, permissions: new Set(['access:general']) },
		params: { slug: 'meeting' },
		platform: undefined,
		depends: () => {}
	}).catch((error) => error);
	assert.equal(memberView.status, 302);
	const summary = await sessionPage({
		locals: facilitator,
		params: { slug: 'meeting' },
		platform: undefined,
		depends: () => {}
	});
	// Guests without accounts stay in the list; the absent member drops out.
	assert.deepEqual(
		summary.participants.map((person) => [person.name, person.status, person.userId]),
		[
			['Ada', 'present', null],
			['Cy', 'maybe', null],
			['Walk-in Wes', 'present', null]
		]
	);
	assert.equal(await markUnrecordedExpectedAbsent(db, session.id, 'host'), 0);
	await endLiveSession(db, session.id);
	await markPresent(db, session.id, bea.id, 'host');
	assert.equal(
		(
			await db
				.select()
				.from(sessionAttendance)
				.where(eq(sessionAttendance.attendeeId, bea.id))
				.get()
		).status,
		'present'
	);
});

test('recaps stay separate and only the public recap reaches the public API', async () => {
	const { db, addSession, facilitator, member } = await fixture();
	const session = await addSession('meeting', {
		isPublic: true,
		status: 'past',
		startsAt: '2020-01-01T18:00'
	});
	let api = await (await publicSessions({ locals: facilitator })).json();
	assert.equal('publicRecap' in api[0], false);

	await recapActions.save({
		locals: facilitator,
		params: { slug: 'meeting' },
		request: formRequest({
			facilitatorRecap: 'Roundtable ran long.',
			memberRecap: 'We talked about **time loops**.',
			publicRecap: 'Seven readers explored time loops.',
			feedbackEnabled: 'on'
		})
	});
	const row = await db.select().from(sessions).where(eq(sessions.id, session.id)).get();
	assert.match(row.memberRecapHtml, /<strong>time loops<\/strong>/);
	api = await (await publicSessions({ locals: facilitator })).json();
	assert.equal(api[0].publicRecap, 'Seven readers explored time loops.');
	assert.equal('memberRecap' in api[0], false);
	assert.equal('facilitatorRecap' in api[0], false);

	const page = await sessionPage({
		locals: member,
		params: { slug: 'meeting' },
		platform: undefined,
		depends: () => {}
	});
	assert.match(page.session.memberRecapHtml, /time loops/);
	assert.equal(page.canGiveFeedback, true);
	assert.equal(page.canFacilitate, false);

	await assert.rejects(
		recapActions.save({ locals: member, params: { slug: 'meeting' }, request: formRequest({}) }),
		(error) => error.status === 403
	);
});

test('feedback is one editable response per member and visible to facilitators only', async () => {
	const { db, addSession, facilitator, member } = await fixture();
	const upcoming = await addSession('soon');
	assert.equal(canGiveFeedback(upcoming), false);
	const past = await addSession('done', { status: 'past', startsAt: '2020-01-01T18:00' });
	assert.equal(canGiveFeedback(past), true);

	const closed = await feedbackActions.submit({
		locals: member,
		params: { slug: 'soon' },
		request: formRequest({ overallRating: '4' })
	});
	assert.equal(closed.status, 400);

	await feedbackActions.submit({
		locals: member,
		params: { slug: 'done' },
		request: formRequest({ overallRating: '4', pace: 'about_right', comments: 'Loved it' })
	});
	await feedbackActions.submit({
		locals: member,
		params: { slug: 'done' },
		request: formRequest({ overallRating: '5', pace: 'too_fast' })
	});
	const own = await feedbackPage({ locals: member, params: { slug: 'done' } });
	assert.equal(own.feedback.overallRating, 5);
	assert.equal(own.feedback.pace, 'too_fast');
	assert.equal(own.feedback.comments, null);

	const { getSessionFeedbackForFacilitator } =
		await import('../src/lib/server/session-workflow.ts');
	const review = await getSessionFeedbackForFacilitator(db, past.id);
	assert.equal(review.length, 1);
	assert.equal(review[0].member.displayName, 'Reader');

	await recapActions.save({
		locals: facilitator,
		params: { slug: 'done' },
		request: formRequest({ facilitatorRecap: '', memberRecap: '', publicRecap: '' })
	});
	const disabled = await db.select().from(sessions).where(eq(sessions.id, past.id)).get();
	assert.equal(disabled.feedbackEnabled, false);
	assert.equal(canGiveFeedback(disabled), false);
});
