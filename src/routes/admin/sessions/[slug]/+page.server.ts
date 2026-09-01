import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	books,
	authors,
	attendeeIdentities,
	series,
	sessionParticipantSubjects,
	sessionParticipants,
	sessions,
	sessionSubjects,
	users
} from '$lib/server/db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { requirePermission } from '$lib/server/auth';
import { newId } from '$lib/server/ids';
import { detectFirstSubjectLink, ensureSubjectSource } from '$lib/server/subject-sources';
import { renderMarkdown } from '$lib/server/markdown';
import { DEFAULT_TIMEZONE, isValidTimezone } from '$lib/server/notification-preferences';
import {
	getPrimaryThreadForSession,
	subscribeActiveMembersToSessionThread
} from '$lib/server/discussions';
import {
	getOrCreateMemberAttendee,
	getParticipantForAttendee,
	getSessionRsvpSlug
} from '$lib/server/rsvp';
import { createTheme, listThemes, resolveSessionTheme } from '$lib/server/themes';

type SubjectKind = 'book' | 'series' | 'author';
type SessionSubjectStatus = 'starter' | 'featured' | 'discussed' | 'mentioned_off_theme';

const sessionStatuses = new Set(['draft', 'current', 'past']);
const sessionSubjectStatuses = new Set(['starter', 'featured', 'discussed', 'mentioned_off_theme']);
const participantSubjectRelations = new Set(['read_for_session', 'considered', 'mentioned']);

function rejectStaleSession(data: FormData, updatedAt: string) {
	const expectedUpdatedAt = data.get('expectedUpdatedAt')?.toString();
	if (expectedUpdatedAt === updatedAt) return null;

	return fail(409, {
		error: 'This session changed after the form was loaded. Reload the page and try again.',
		staleSession: true
	});
}

function getOptionalString(data: FormData, key: string) {
	return data.get(key)?.toString()?.trim() || null;
}

function getSessionSubjectStatus(data: FormData): SessionSubjectStatus {
	const status = data.get('status')?.toString();
	return sessionSubjectStatuses.has(status ?? '') ? (status as SessionSubjectStatus) : 'starter';
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
	const authorIds = rawLinks.filter((l) => l.subjectType === 'author').map((l) => l.subjectId);

	const bookRows = bookIds.length ? await locals.db.select().from(books).all() : [];
	const seriesRows = seriesIds.length ? await locals.db.select().from(series).all() : [];
	const authorRows = authorIds.length ? await locals.db.select().from(authors).all() : [];

	const bookMap = new Map(bookRows.filter((b) => bookIds.includes(b.id)).map((b) => [b.id, b]));
	const seriesMap = new Map(
		seriesRows.filter((s) => seriesIds.includes(s.id)).map((s) => [s.id, s])
	);
	const authorMap = new Map(
		authorRows.filter((a) => authorIds.includes(a.id)).map((a) => [a.id, a])
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
			if (l.subjectType === 'author') {
				const a = authorMap.get(l.subjectId);
				return a ? { kind: 'author' as const, link: l, author: a } : null;
			}
			return null;
		})
		.filter((x): x is NonNullable<typeof x> => x !== null);

	const allThemes = await listThemes(locals.db);

	const participantReads = await locals.db
		.select({
			read: sessionParticipantSubjects,
			user: {
				id: users.id,
				displayName: users.displayName
			}
		})
		.from(sessionParticipantSubjects)
		.innerJoin(
			sessionParticipants,
			eq(sessionParticipantSubjects.participantId, sessionParticipants.id)
		)
		.innerJoin(attendeeIdentities, eq(sessionParticipants.attendeeId, attendeeIdentities.id))
		.innerJoin(users, eq(attendeeIdentities.userId, users.id))
		.where(eq(sessionParticipants.sessionId, session.id))
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
	const allAuthors = await locals.db
		.select({
			id: authors.id,
			name: authors.name,
			slug: authors.slug,
			deletedAt: authors.deletedAt
		})
		.from(authors)
		.orderBy(asc(authors.name))
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
		participantReads,
		allBooks,
		allSeries,
		allAuthors,
		allUsers
	};
};

export const actions: Actions = {
	updateSession: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');

		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const staleFailure = rejectStaleSession(data, row.updatedAt);
		if (staleFailure) return staleFailure;

		const title = data.get('title')?.toString()?.trim();
		if (!title || title.length < 2)
			return fail(400, { error: 'Title must be at least 2 characters.' });

		const bodySource = getOptionalString(data, 'bodySource');
		const durationMinutes = Number.parseInt(data.get('durationMinutes')?.toString() ?? '', 10);
		const startsAt = getOptionalString(data, 'startsAt');
		const timezone = getOptionalString(data, 'timezone') ?? DEFAULT_TIMEZONE;
		if (!isValidTimezone(timezone)) {
			return fail(400, { error: 'Timezone must be a valid IANA timezone.' });
		}
		if (!startsAt) {
			return fail(400, { error: 'Starts At is required for a session.' });
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
			themeId: sessionTheme.themeId,
			theme: themeTitle,
			themeTitle,
			themeSummary: getOptionalString(data, 'themeSummary'),
			bodySource,
			bodyHtml: bodySource ? renderMarkdown(bodySource) : null,
			startsAt,
			timezone,
			durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
			locationName: getOptionalString(data, 'locationName'),
			rsvpSlug: getOptionalString(data, 'rsvpSlug') ?? getSessionRsvpSlug(row),
			rsvpCapacity: Math.max(
				1,
				Number.parseInt(data.get('rsvpCapacity')?.toString() ?? '12', 10) || 12
			),
			rsvpWaitlistEnabled: data.get('rsvpWaitlistEnabled') === 'on',
			isPublic: data.get('isPublic') === 'on',
			astroPath: getOptionalString(data, 'astroPath'),
			externalUrl: getOptionalString(data, 'externalUrl'),
			updatedAt: new Date().toISOString()
		};

		await locals.db
			.update(sessions)
			.set({
				title: updatedSession.title,
				themeId: updatedSession.themeId,
				theme: updatedSession.theme,
				themeTitle: updatedSession.themeTitle,
				themeSummary: updatedSession.themeSummary,
				bodySource: updatedSession.bodySource,
				bodyHtml: updatedSession.bodyHtml,
				startsAt: updatedSession.startsAt,
				timezone: updatedSession.timezone,
				durationMinutes: updatedSession.durationMinutes,
				locationName: updatedSession.locationName,
				rsvpSlug: updatedSession.rsvpSlug,
				rsvpCapacity: updatedSession.rsvpCapacity,
				rsvpWaitlistEnabled: updatedSession.rsvpWaitlistEnabled,
				isPublic: updatedSession.isPublic,
				astroPath: updatedSession.astroPath,
				updatedAt: updatedSession.updatedAt
			})
			.where(eq(sessions.id, row.id));

		return { updated: true };
	},

	updateStatus: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');

		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const staleFailure = rejectStaleSession(data, row.updatedAt);
		if (staleFailure) return staleFailure;

		const requestedStatus = data.get('status')?.toString();
		if (!sessionStatuses.has(requestedStatus ?? '')) {
			return fail(400, { error: 'Choose a valid session status.' });
		}
		const status = requestedStatus as 'draft' | 'current' | 'past';

		const allSessions =
			status === 'current' ? await locals.db.select().from(sessions).all() : [row];
		const statusChanges = allSessions
			.map((session) => {
				if (session.id === row.id) return { session, status };
				const isEarlier = !!row.startsAt && !!session.startsAt && session.startsAt < row.startsAt;
				if (session.status === 'current' || (isEarlier && session.status !== 'past')) {
					return { session, status: 'past' as const };
				}
				return null;
			})
			.filter((change): change is NonNullable<typeof change> => change !== null)
			.filter((change) => change.session.status !== change.status);

		if (statusChanges.length === 0) {
			return { statusUpdated: true, promotedPreviousCount: 0 };
		}

		const updatedAt = new Date().toISOString();
		const statusUpdates = statusChanges.map((change) =>
			locals.db
				.update(sessions)
				.set({ status: change.status, updatedAt })
				.where(eq(sessions.id, change.session.id))
		);
		await locals.db.batch(
			statusUpdates as [(typeof statusUpdates)[number], ...(typeof statusUpdates)[number][]]
		);

		if (row.status !== 'current' && status === 'current') {
			const primaryThread = await getPrimaryThreadForSession(locals.db, row.id);
			if (primaryThread) {
				await subscribeActiveMembersToSessionThread(locals.db, primaryThread.id);
			}
		}

		return {
			statusUpdated: true,
			promotedPreviousCount: statusChanges.filter(
				(change) => change.session.id !== row.id && change.status === 'past'
			).length
		};
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
		if (!kind || !['book', 'series', 'author'].includes(kind))
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
		if (!link)
			return fail(400, {
				error: 'Only Goodreads or Hardcover book, series, or author URLs are supported.'
			});

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
		const user = await locals.db.select().from(users).where(eq(users.id, userId)).get();
		if (!user) return fail(404, { error: 'Member not found.' });
		const attendee = await getOrCreateMemberAttendee(locals.db, user);

		await locals.db
			.insert(sessionParticipants)
			.values({
				id: newId(),
				sessionId: row.id,
				attendeeId: attendee.id,
				nameSnapshot: attendee.name,
				emailSnapshot: attendee.email,
				attendanceStatus: 'attended',
				rsvpSource: 'admin'
			})
			.onConflictDoNothing();
		const participant = await getParticipantForAttendee(locals.db, row.id, attendee.id);
		if (!participant) return fail(500, { error: 'Could not create participant.' });

		await locals.db
			.insert(sessionParticipantSubjects)
			.values({
				participantId: participant.id,
				subjectType: kind,
				subjectId,
				relationType: getParticipantSubjectRelation(data),
				isPrimaryPick: data.get('isPrimaryPick') === 'on',
				isThemeRelated: data.get('isThemeRelated') === 'on',
				note: getOptionalString(data, 'note')
			})
			.onConflictDoUpdate({
				target: [
					sessionParticipantSubjects.participantId,
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
		if (kind !== 'book' && kind !== 'series') {
			return fail(400, { error: 'Invalid subject kind.' });
		}
		const attendee = await locals.db
			.select()
			.from(attendeeIdentities)
			.where(eq(attendeeIdentities.userId, userId))
			.get();
		if (!attendee) return fail(404, { error: 'Participant not found.' });
		const participant = await getParticipantForAttendee(locals.db, row.id, attendee.id);
		if (!participant) return fail(404, { error: 'Participant not found.' });

		await locals.db
			.delete(sessionParticipantSubjects)
			.where(
				and(
					eq(sessionParticipantSubjects.participantId, participant.id),
					eq(sessionParticipantSubjects.subjectType, kind),
					eq(sessionParticipantSubjects.subjectId, subjectId)
				)
			);

		return { participantSubjectRemoved: true };
	}
};
