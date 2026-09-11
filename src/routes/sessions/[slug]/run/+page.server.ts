import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { attendeeIdentities, sessionParticipants, sessions, users } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/auth';
import { sessionAccessCondition, selectThemeStatement } from '$lib/server/session-lifecycle';
import { getOrCreateAdminAttendee, getOrCreateMemberAttendee } from '$lib/server/rsvp';
import { createTheme, listThemes, resolveSessionTheme } from '$lib/server/themes';
import {
	acceptAgendaSuggestion,
	clearAttendance,
	createAgendaItem,
	createQuickNote,
	deleteAgendaItem,
	deleteQuickNote,
	endLiveSession,
	findNextSession,
	getAttendanceByAttendee,
	getQuickNotes,
	getSessionAgenda,
	isAgendaVisibility,
	listAttendeeChoices,
	markAbsent,
	markPresent,
	markUnrecordedExpectedAbsent,
	moveAgendaItem,
	rejectAgendaSuggestion,
	reorderAgendaItems,
	setAgendaItemStatus,
	setNextThemeNote,
	startLiveSession,
	updateAgendaItem,
	workflowPhase
} from '$lib/server/session-workflow';

async function requireSession(locals: App.Locals, slug: string) {
	requirePermission(locals, 'sessions:facilitate');
	const session = await locals.db
		.select()
		.from(sessions)
		.where(and(eq(sessions.slug, slug), sessionAccessCondition(locals)))
		.get();
	if (!session) throw error(404, 'Session not found');
	return session;
}

function text(data: FormData, key: string) {
	return data.get(key)?.toString().trim() || null;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(302, '/auth/login');
	const session = await requireSession(locals, params.slug);

	const [rsvps, attendance, agenda, notes, nextSession, themes, choices] = await Promise.all([
		locals.db
			.select({
				participant: sessionParticipants,
				attendee: attendeeIdentities,
				user: { id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl }
			})
			.from(sessionParticipants)
			.innerJoin(attendeeIdentities, eq(sessionParticipants.attendeeId, attendeeIdentities.id))
			.leftJoin(users, eq(attendeeIdentities.userId, users.id))
			.where(
				and(
					eq(sessionParticipants.sessionId, session.id),
					inArray(sessionParticipants.attendanceStatus, ['attending', 'waitlisted', 'maybe'])
				)
			)
			.orderBy(asc(attendeeIdentities.name))
			.all(),
		getAttendanceByAttendee(locals.db, session.id),
		getSessionAgenda(locals.db, session.id, { userId: locals.user.id, canFacilitate: true }),
		getQuickNotes(locals.db, session.id),
		findNextSession(locals.db, session),
		listThemes(locals.db),
		listAttendeeChoices(locals.db)
	]);

	const rsvpAttendeeIds = new Set(rsvps.map((row) => row.attendee.id));
	// Anyone recorded present or absent who had no RSVP still shows in the attendance list.
	const extraIds = Object.keys(attendance).filter((id) => !rsvpAttendeeIds.has(id));
	const extras = extraIds.length
		? await locals.db.all<{ attendeeId: string; name: string; userId: string | null }>(sql`
				SELECT attendee_identities.id AS attendeeId, attendee_identities.name, users.id AS userId
				FROM attendee_identities
				INNER JOIN json_each(${JSON.stringify(extraIds)}) extra_attendee
					ON extra_attendee.value = attendee_identities.id
				LEFT JOIN users ON attendee_identities.user_id = users.id
				ORDER BY attendee_identities.name
			`)
		: [];

	const roster = [
		...rsvps.map((row) => ({
			attendeeId: row.attendee.id,
			name: row.attendee.name,
			isMember: Boolean(row.user),
			rsvp: row.participant.attendanceStatus as 'attending' | 'waitlisted' | 'maybe',
			attendance: attendance[row.attendee.id]?.status ?? null
		})),
		...extras.map((row) => ({
			attendeeId: row.attendeeId,
			name: row.name,
			isMember: Boolean(row.userId),
			rsvp: null,
			attendance: attendance[row.attendeeId]?.status ?? null
		}))
	];
	const rosterIds = new Set(roster.map((row) => row.attendeeId));

	return {
		session,
		phase: workflowPhase(session),
		roster,
		addable: choices.filter((choice) => !rosterIds.has(choice.id)),
		agenda,
		notes,
		nextSession: nextSession ?? null,
		themes: themes
			.filter((theme) => theme.status !== 'archived' || theme.id === nextSession?.themeId)
			.map((theme) => ({ id: theme.id, name: theme.name, status: theme.status }))
	};
};

export const actions: Actions = {
	startLive: async ({ locals, params }) => {
		const session = await requireSession(locals, params.slug);
		await startLiveSession(locals.db, session.id);
		return { started: true };
	},

	endLive: async ({ locals, params, request }) => {
		const session = await requireSession(locals, params.slug);
		const data = await request.formData();
		let markedAbsent = 0;
		if (data.get('markRemainingAbsent') === 'on') {
			markedAbsent = await markUnrecordedExpectedAbsent(
				locals.db,
				session.id,
				locals.user?.id ?? null
			);
		}
		await endLiveSession(locals.db, session.id);
		return { ended: true, markedAbsent };
	},

	/** One tap: not recorded -> present -> not recorded. Long-form absent via `outcome`. */
	attendance: async ({ locals, params, request }) => {
		const session = await requireSession(locals, params.slug);
		const data = await request.formData();
		const attendeeId = text(data, 'attendeeId');
		const outcome = text(data, 'outcome');
		if (!attendeeId) return fail(400, { error: 'Missing attendee.' });
		if (outcome === 'present')
			await markPresent(locals.db, session.id, attendeeId, locals.user?.id ?? null);
		else if (outcome === 'absent')
			await markAbsent(locals.db, session.id, attendeeId, locals.user?.id ?? null);
		else await clearAttendance(locals.db, session.id, attendeeId);
		return { attendanceUpdated: true };
	},

	/** Add someone who did not RSVP: an existing identity, a member, or a new guest name. */
	addAttendee: async ({ locals, params, request }) => {
		const session = await requireSession(locals, params.slug);
		const data = await request.formData();
		const selection = text(data, 'identity') ?? '';
		const guestName = text(data, 'guestName');
		let attendeeId: string | null = null;
		if (selection.startsWith('attendee:')) {
			attendeeId = selection.slice(9);
		} else if (selection.startsWith('user:')) {
			const user = await locals.db
				.select()
				.from(users)
				.where(eq(users.id, selection.slice(5)))
				.get();
			if (!user) return fail(404, { error: 'Member not found.' });
			attendeeId = (await getOrCreateMemberAttendee(locals.db, user)).id;
		} else if (guestName) {
			attendeeId = (await getOrCreateAdminAttendee(locals.db, { name: guestName })).id;
		}
		if (!attendeeId) return fail(400, { error: 'Choose a person or enter a guest name.' });
		await markPresent(locals.db, session.id, attendeeId, locals.user?.id ?? null);
		return { attendeeAdded: true };
	},

	agendaStatus: async ({ locals, params, request }) => {
		const session = await requireSession(locals, params.slug);
		const data = await request.formData();
		const itemId = text(data, 'itemId');
		const status = text(data, 'status');
		if (!itemId || (status !== 'ready' && status !== 'completed' && status !== 'skipped')) {
			return fail(400, { error: 'Invalid agenda update.' });
		}
		await setAgendaItemStatus(locals.db, session.id, itemId, status);
		return { agendaUpdated: true };
	},

	createAgendaItem: async ({ locals, params, request }) => {
		const session = await requireSession(locals, params.slug);
		const data = await request.formData();
		const title = text(data, 'title');
		if (!title) return fail(400, { error: 'Enter a title for the agenda item.' });
		const visibility = text(data, 'visibility');
		await createAgendaItem(locals.db, session.id, {
			title,
			description: text(data, 'description'),
			visibility: isAgendaVisibility(visibility) ? visibility : 'members'
		});
		return { agendaUpdated: true };
	},

	updateAgendaItem: async ({ locals, params, request }) => {
		const session = await requireSession(locals, params.slug);
		const data = await request.formData();
		const itemId = text(data, 'itemId');
		const title = text(data, 'title');
		if (!itemId || !title) return fail(400, { error: 'Enter a title for the agenda item.' });
		const visibility = text(data, 'visibility');
		await updateAgendaItem(locals.db, session.id, itemId, {
			title,
			description: text(data, 'description'),
			visibility: isAgendaVisibility(visibility) ? visibility : 'members'
		});
		return { agendaUpdated: true };
	},

	deleteAgendaItem: async ({ locals, params, request }) => {
		const session = await requireSession(locals, params.slug);
		const itemId = text(await request.formData(), 'itemId');
		if (!itemId) return fail(400, { error: 'Missing agenda item.' });
		await deleteAgendaItem(locals.db, session.id, itemId);
		return { agendaUpdated: true };
	},

	moveAgendaItem: async ({ locals, params, request }) => {
		const session = await requireSession(locals, params.slug);
		const data = await request.formData();
		const itemId = text(data, 'itemId');
		const direction = text(data, 'direction');
		if (!itemId || (direction !== 'up' && direction !== 'down')) {
			return fail(400, { error: 'Invalid move.' });
		}
		await moveAgendaItem(locals.db, session.id, itemId, direction);
		return { agendaUpdated: true };
	},

	/** Drag-and-drop result: the full ordered list of non-pending item ids. */
	reorderAgenda: async ({ locals, params, request }) => {
		const session = await requireSession(locals, params.slug);
		const ids = (await request.formData()).getAll('itemId').map(String).filter(Boolean);
		if (ids.length === 0) return fail(400, { error: 'Nothing to reorder.' });
		await reorderAgendaItems(locals.db, session.id, ids);
		return { agendaUpdated: true };
	},

	acceptSuggestion: async ({ locals, params, request }) => {
		const session = await requireSession(locals, params.slug);
		const data = await request.formData();
		const itemId = text(data, 'itemId');
		if (!itemId) return fail(400, { error: 'Missing suggestion.' });
		const visibility = text(data, 'visibility');
		const title = text(data, 'title');
		await acceptAgendaSuggestion(locals.db, session.id, itemId, {
			...(title ? { title } : {}),
			...(data.has('description') ? { description: text(data, 'description') } : {}),
			visibility: isAgendaVisibility(visibility) ? visibility : 'members'
		});
		return { agendaUpdated: true };
	},

	rejectSuggestion: async ({ locals, params, request }) => {
		const session = await requireSession(locals, params.slug);
		const itemId = text(await request.formData(), 'itemId');
		if (!itemId) return fail(400, { error: 'Missing suggestion.' });
		await rejectAgendaSuggestion(locals.db, session.id, itemId);
		return { agendaUpdated: true };
	},

	addNote: async ({ locals, params, request }) => {
		const session = await requireSession(locals, params.slug);
		const body = text(await request.formData(), 'body');
		if (!body) return fail(400, { error: 'Write a note first.' });
		await createQuickNote(locals.db, session.id, body, locals.user?.id ?? null);
		return { noteAdded: true };
	},

	deleteNote: async ({ locals, params, request }) => {
		const session = await requireSession(locals, params.slug);
		const noteId = text(await request.formData(), 'noteId');
		if (!noteId) return fail(400, { error: 'Missing note.' });
		await deleteQuickNote(locals.db, session.id, noteId);
		return { noteDeleted: true };
	},

	/** Write in a theme that is not in the pool yet; the picker selects it on success. */
	createTheme: async ({ locals, params, request }) => {
		await requireSession(locals, params.slug);
		const name = text(await request.formData(), 'name');
		if (!name || name.length < 2) {
			return fail(400, { error: 'Theme name must be at least 2 characters.' });
		}
		const theme = await createTheme(locals.db, {
			name,
			status: 'idea',
			submittedByUserId: locals.user?.id ?? null
		});
		return { themeCreated: true, theme };
	},

	/** Handoff: set the next session's theme when it exists, otherwise keep a note here. */
	nextTheme: async ({ locals, params, request }) => {
		const session = await requireSession(locals, params.slug);
		const data = await request.formData();
		const note = text(data, 'nextThemeNote');
		const themeId = text(data, 'themeId');
		const nextSessionId = text(data, 'nextSessionId');

		if (nextSessionId && themeId) {
			if (!locals.permissions.has('sessions:edit')) {
				return fail(403, { error: 'Only session editors can change the next session.' });
			}
			const next = await locals.db
				.select()
				.from(sessions)
				.where(eq(sessions.id, nextSessionId))
				.get();
			if (!next) return fail(404, { error: 'Next session not found.' });
			const theme = await resolveSessionTheme(locals.db, { themeId });
			if (!theme.themeId) return fail(400, { error: 'Choose an existing theme.' });
			const now = new Date().toISOString();
			const update = locals.db
				.update(sessions)
				.set({
					themeId: theme.themeId,
					theme: theme.themeName,
					themeTitle: theme.themeName,
					updatedAt: now
				})
				.where(eq(sessions.id, next.id));
			if (next.status !== 'draft') {
				await locals.db.batch([selectThemeStatement(locals.db, theme.themeId), update]);
			} else {
				await update;
			}
		}
		await setNextThemeNote(locals.db, session.id, note);
		return { nextThemeSaved: true };
	}
};
