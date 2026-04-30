import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	books,
	series,
	sessionParticipantSubjects,
	sessionParticipants,
	sessions,
	sessionSubjects,
	users
} from '$lib/server/db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { requirePermission } from '$lib/server/auth';
import { detectFirstSubjectLink, ensureSubjectSource } from '$lib/server/subject-sources';
import { renderMarkdown } from '$lib/server/markdown';
import { getSessionRsvpSlug, upsertRsvpEvent } from '$lib/server/rsvp';
import { createTheme, listThemes, resolveSessionTheme } from '$lib/server/themes';

type SubjectKind = 'book' | 'series';
type SessionSubjectStatus = 'starter' | 'featured' | 'discussed' | 'mentioned_off_theme';

const sessionStatuses = new Set(['draft', 'current', 'past']);
const sessionSubjectStatuses = new Set(['starter', 'featured', 'discussed', 'mentioned_off_theme']);
const attendanceStatuses = new Set(['attending', 'not_attending', 'maybe', 'attended']);
const participantSubjectRelations = new Set(['read_for_session', 'considered', 'mentioned']);

function getOptionalString(data: FormData, key: string) {
	return data.get(key)?.toString()?.trim() || null;
}

function getSessionStatus(data: FormData) {
	const status = data.get('status')?.toString();
	return sessionStatuses.has(status ?? '') ? (status as 'draft' | 'current' | 'past') : 'draft';
}

function getSessionSubjectStatus(data: FormData): SessionSubjectStatus {
	const status = data.get('status')?.toString();
	return sessionSubjectStatuses.has(status ?? '') ? (status as SessionSubjectStatus) : 'starter';
}

function getAttendanceStatus(data: FormData) {
	const status = data.get('attendanceStatus')?.toString();
	return attendanceStatuses.has(status ?? '')
		? (status as 'attending' | 'not_attending' | 'maybe' | 'attended')
		: 'attending';
}

function getParticipantSubjectRelation(data: FormData) {
	const relation = data.get('relationType')?.toString();
	return participantSubjectRelations.has(relation ?? '')
		? (relation as 'read_for_session' | 'considered' | 'mentioned')
		: 'read_for_session';
}

export const load: PageServerLoad = async ({ params, locals }) => {
	requirePermission(locals, 'sessions:edit');

	const session = await locals.db
		.select()
		.from(sessions)
		.where(eq(sessions.slug, params.slug))
		.get();
	if (!session) throw error(404, 'Session not found');

	// Load all links for this session
	const rawLinks = await locals.db
		.select()
		.from(sessionSubjects)
		.where(eq(sessionSubjects.sessionId, session.id))
		.orderBy(desc(sessionSubjects.createdAt))
		.all();

	// Hydrate books
	const bookIds = rawLinks.filter((l) => l.subjectType === 'book').map((l) => l.subjectId);
	const seriesIds = rawLinks.filter((l) => l.subjectType === 'series').map((l) => l.subjectId);

	const bookRows = bookIds.length ? await locals.db.select().from(books).all() : [];
	const seriesRows = seriesIds.length ? await locals.db.select().from(series).all() : [];

	const bookMap = new Map(bookRows.filter((b) => bookIds.includes(b.id)).map((b) => [b.id, b]));
	const seriesMap = new Map(
		seriesRows.filter((s) => seriesIds.includes(s.id)).map((s) => [s.id, s])
	);

	const linkedSubjects = rawLinks
		.map((l) => {
			if (l.subjectType === 'book') {
				const b = bookMap.get(l.subjectId);
				return b ? { kind: 'book' as const, link: l, book: b } : null;
			}
			if (l.subjectType === 'series') {
				const s = seriesMap.get(l.subjectId);
				return s ? { kind: 'series' as const, link: l, series: s } : null;
			}
			return null;
		})
		.filter((x): x is NonNullable<typeof x> => x !== null);

	const [allThemes, participants] = await Promise.all([
		listThemes(locals.db),
		locals.db
			.select({
				participant: sessionParticipants,
				user: {
					id: users.id,
					displayName: users.displayName,
					email: users.email,
					avatarUrl: users.avatarUrl
				}
			})
			.from(sessionParticipants)
			.innerJoin(users, eq(sessionParticipants.userId, users.id))
			.where(eq(sessionParticipants.sessionId, session.id))
			.orderBy(asc(users.displayName))
			.all()
	]);

	const participantReads = await locals.db
		.select({
			read: sessionParticipantSubjects,
			user: {
				id: users.id,
				displayName: users.displayName
			}
		})
		.from(sessionParticipantSubjects)
		.innerJoin(users, eq(sessionParticipantSubjects.userId, users.id))
		.where(eq(sessionParticipantSubjects.sessionId, session.id))
		.orderBy(asc(users.displayName), desc(sessionParticipantSubjects.isPrimaryPick))
		.all();

	// For adding new links — all books/series not yet linked, excluding deleted.
	const allBooks = await locals.db
		.select({
			id: books.id,
			title: books.title,
			authorText: books.authorText,
			slug: books.slug,
			deletedAt: books.deletedAt
		})
		.from(books)
		.orderBy(asc(books.title))
		.all();
	const allSeries = await locals.db
		.select({
			id: series.id,
			title: series.title,
			authorText: series.authorText,
			slug: series.slug,
			deletedAt: series.deletedAt
		})
		.from(series)
		.orderBy(asc(series.title))
		.all();
	const allUsers = await locals.db
		.select({
			id: users.id,
			displayName: users.displayName,
			email: users.email,
			status: users.status,
			avatarUrl: users.avatarUrl
		})
		.from(users)
		.orderBy(asc(users.displayName))
		.all();

	return {
		session,
		themes: allThemes,
		linkedSubjects,
		participants,
		participantReads,
		allBooks,
		allSeries,
		allUsers
	};
};

export const actions: Actions = {
	updateSession: async ({ request, params, locals, platform }) => {
		requirePermission(locals, 'sessions:edit');

		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const title = data.get('title')?.toString()?.trim();
		if (!title || title.length < 2)
			return fail(400, { error: 'Title must be at least 2 characters.' });

		const bodySource = getOptionalString(data, 'bodySource');
		const durationMinutes = Number.parseInt(data.get('durationMinutes')?.toString() ?? '', 10);
		const startsAt = getOptionalString(data, 'startsAt');
		if (!startsAt) {
			return fail(400, { error: 'Starts At is required to sync an RSVP event.' });
		}
		const rsvpDb = platform?.env.RSVP_DB;
		if (!rsvpDb) {
			return fail(500, { error: 'RSVP database binding is not configured.' });
		}
		const sessionTheme = await resolveSessionTheme(locals.db, {
			themeId: getOptionalString(data, 'themeId')
		});
		if (!sessionTheme.themeId || !sessionTheme.themeName) {
			return fail(400, { error: 'Choose a theme from the library before saving the session.' });
		}
		const themeTitle = sessionTheme.themeName;
		const updatedSession = {
			...row,
			title,
			status: getSessionStatus(data),
			themeId: sessionTheme.themeId,
			theme: themeTitle,
			themeTitle,
			themeSummary: getOptionalString(data, 'themeSummary'),
			bodySource,
			bodyHtml: bodySource ? renderMarkdown(bodySource) : null,
			startsAt,
			durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
			locationName: getOptionalString(data, 'locationName'),
			rsvpSlug: getOptionalString(data, 'rsvpSlug') ?? getSessionRsvpSlug(row),
			isPublic: data.get('isPublic') === 'on',
			astroPath: getOptionalString(data, 'astroPath'),
			externalUrl: getOptionalString(data, 'externalUrl'),
			updatedAt: new Date().toISOString()
		};

		const rsvpEvent = await upsertRsvpEvent({
			db: rsvpDb,
			session: updatedSession
		});
		if (!rsvpEvent) {
			return fail(400, { error: 'Starts At must be a valid date for the RSVP event.' });
		}

		await locals.db
			.update(sessions)
			.set({
				title: updatedSession.title,
				status: updatedSession.status,
				themeId: updatedSession.themeId,
				theme: updatedSession.theme,
				themeTitle: updatedSession.themeTitle,
				themeSummary: updatedSession.themeSummary,
				bodySource: updatedSession.bodySource,
				bodyHtml: updatedSession.bodyHtml,
				startsAt: updatedSession.startsAt,
				durationMinutes: updatedSession.durationMinutes,
				locationName: updatedSession.locationName,
				rsvpSlug: rsvpEvent.slug,
				isPublic: updatedSession.isPublic,
				astroPath: updatedSession.astroPath,
				updatedAt: updatedSession.updatedAt
			})
			.where(eq(sessions.id, row.id));

		return { updated: true };
	},

	createTheme: async ({ request, locals }) => {
		requirePermission(locals, 'sessions:edit');

		const data = await request.formData();
		const name = getOptionalString(data, 'name');
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

	addLink: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const kind = data.get('kind')?.toString() as SubjectKind | undefined;
		const subjectId = data.get('subjectId')?.toString();
		if (!kind || (kind !== 'book' && kind !== 'series'))
			return fail(400, { error: 'Invalid subject kind.' });
		if (!subjectId) return fail(400, { error: 'Select a subject to link.' });

		const status = getSessionSubjectStatus(data);
		const note = data.get('note')?.toString()?.trim() || null;

		await locals.db
			.insert(sessionSubjects)
			.values({
				sessionId: row.id,
				subjectType: kind,
				subjectId,
				status,
				note,
				addedByUserId: locals.user?.id ?? null
			})
			.onConflictDoNothing();

		return { linkAdded: true };
	},

	addLinkFromUrl: async ({ request, params, locals, platform }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const url = data.get('url')?.toString()?.trim() || '';
		const status = getSessionSubjectStatus(data);
		const note = data.get('note')?.toString()?.trim() || null;

		const link = detectFirstSubjectLink(url);
		if (!link) return fail(400, { error: 'Only Goodreads book or series URLs are supported.' });

		const result = await ensureSubjectSource(locals.db, link, platform?.env, {
			sessionLink: {
				sessionId: row.id,
				status,
				note,
				addedByUserId: locals.user?.id ?? null
			}
		});

		if (result.resolvedSubjectId) {
			return { linkAddedFromResolved: true };
		}
		return { linkQueuedFromUrl: true };
	},

	updateLink: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const kind = data.get('kind')?.toString() as SubjectKind | undefined;
		const subjectId = data.get('subjectId')?.toString();
		if (!kind || !subjectId) return fail(400, { error: 'Missing subject reference.' });

		const status = getSessionSubjectStatus(data);
		const note = data.get('note')?.toString()?.trim() || null;

		await locals.db
			.update(sessionSubjects)
			.set({ status, note, updatedAt: new Date().toISOString() })
			.where(
				and(
					eq(sessionSubjects.sessionId, row.id),
					eq(sessionSubjects.subjectType, kind),
					eq(sessionSubjects.subjectId, subjectId)
				)
			);

		return { linkUpdated: true };
	},

	removeLink: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const kind = data.get('kind')?.toString() as SubjectKind | undefined;
		const subjectId = data.get('subjectId')?.toString();
		if (!kind || !subjectId) return fail(400, { error: 'Missing subject reference.' });

		await locals.db
			.delete(sessionSubjects)
			.where(
				and(
					eq(sessionSubjects.sessionId, row.id),
					eq(sessionSubjects.subjectType, kind),
					eq(sessionSubjects.subjectId, subjectId)
				)
			);

		return { linkRemoved: true };
	},

	upsertParticipant: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const userId = data.get('userId')?.toString();
		if (!userId) return fail(400, { error: 'Select a member.' });

		await locals.db
			.insert(sessionParticipants)
			.values({
				sessionId: row.id,
				userId,
				attendanceStatus: getAttendanceStatus(data),
				rsvpSource: 'admin',
				note: getOptionalString(data, 'note')
			})
			.onConflictDoUpdate({
				target: [sessionParticipants.sessionId, sessionParticipants.userId],
				set: {
					attendanceStatus: getAttendanceStatus(data),
					rsvpSource: 'admin',
					note: getOptionalString(data, 'note'),
					updatedAt: new Date().toISOString()
				}
			});

		return { participantSaved: true };
	},

	removeParticipant: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const userId = data.get('userId')?.toString();
		if (!userId) return fail(400, { error: 'Missing member reference.' });

		await locals.db
			.delete(sessionParticipants)
			.where(
				and(eq(sessionParticipants.sessionId, row.id), eq(sessionParticipants.userId, userId))
			);

		return { participantRemoved: true };
	},

	upsertParticipantSubject: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const userId = data.get('userId')?.toString();
		const kind = data.get('kind')?.toString() as SubjectKind | undefined;
		const subjectId = data.get('subjectId')?.toString();
		if (!userId) return fail(400, { error: 'Select a member.' });
		if (!kind || (kind !== 'book' && kind !== 'series'))
			return fail(400, { error: 'Invalid subject kind.' });
		if (!subjectId) return fail(400, { error: 'Select a subject.' });

		await locals.db
			.insert(sessionParticipants)
			.values({
				sessionId: row.id,
				userId,
				attendanceStatus: 'attended',
				rsvpSource: 'admin'
			})
			.onConflictDoNothing();

		await locals.db
			.insert(sessionParticipantSubjects)
			.values({
				sessionId: row.id,
				userId,
				subjectType: kind,
				subjectId,
				relationType: getParticipantSubjectRelation(data),
				isPrimaryPick: data.get('isPrimaryPick') === 'on',
				isThemeRelated: data.get('isThemeRelated') === 'on',
				note: getOptionalString(data, 'note')
			})
			.onConflictDoUpdate({
				target: [
					sessionParticipantSubjects.sessionId,
					sessionParticipantSubjects.userId,
					sessionParticipantSubjects.subjectType,
					sessionParticipantSubjects.subjectId
				],
				set: {
					relationType: getParticipantSubjectRelation(data),
					isPrimaryPick: data.get('isPrimaryPick') === 'on',
					isThemeRelated: data.get('isThemeRelated') === 'on',
					note: getOptionalString(data, 'note'),
					updatedAt: new Date().toISOString()
				}
			});

		return { participantSubjectSaved: true };
	},

	removeParticipantSubject: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const userId = data.get('userId')?.toString();
		const kind = data.get('kind')?.toString() as SubjectKind | undefined;
		const subjectId = data.get('subjectId')?.toString();
		if (!userId || !kind || !subjectId) return fail(400, { error: 'Missing read reference.' });

		await locals.db
			.delete(sessionParticipantSubjects)
			.where(
				and(
					eq(sessionParticipantSubjects.sessionId, row.id),
					eq(sessionParticipantSubjects.userId, userId),
					eq(sessionParticipantSubjects.subjectType, kind),
					eq(sessionParticipantSubjects.subjectId, subjectId)
				)
			);

		return { participantSubjectRemoved: true };
	}
};
