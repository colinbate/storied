import { sessionAccessCondition } from '$lib/server/session-lifecycle';
import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	books,
	authors,
	attendeeIdentities,
	series,
	sessionReadingChoices,
	sessionParticipants,
	sessionSubjects,
	sessions,
	subscriptions,
	threads,
	users
} from '$lib/server/db/schema';
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { newId } from '$lib/server/ids';
import {
	attendingCount,
	canAcceptSessionRsvps,
	canDeclineSessionRsvp,
	getCurrentUserSessionRsvp,
	getOrCreateMemberAttendee,
	setMemberRsvp
} from '$lib/server/rsvp';
import { threadAccessCondition, threadViewer } from '$lib/server/thread-access';
import { loadClassificationsBySubject } from '$lib/server/classifications';
import { detectSubjectLinks } from '$lib/server/book-links';
import { ensureSubjectSource } from '$lib/server/subject-sources';
import {
	isSessionReadingStatus,
	removeSessionReadingChoice,
	upsertSessionReadingChoice
} from '$lib/server/session-reading';
import {
	createPrimarySessionThread,
	getPrimaryThreadForSession,
	subscribeActiveMembersToSessionThread
} from '$lib/server/discussions';
import { getOrCreateNotificationPreferences } from '$lib/server/notification-preferences';
import {
	createThreadActions,
	findThreadRow,
	loadThreadView,
	primarySessionThreadCondition,
	threadSubjectsDependency
} from '$lib/server/thread-view';
import {
	canFacilitate,
	canGiveFeedback,
	getAttendanceByAttendee,
	getOwnSessionFeedback,
	getSessionAgenda,
	submitAgendaSuggestion,
	withdrawAgendaSuggestion,
	workflowPhase
} from '$lib/server/session-workflow';

async function findSession(locals: App.Locals, slug: string) {
	return locals.db
		.select()
		.from(sessions)
		.where(and(eq(sessions.slug, slug), sessionAccessCondition(locals)))
		.get();
}

async function requireSession(locals: App.Locals, slug: string) {
	const session = await findSession(locals, slug);
	if (!session) throw error(404, 'Session not found');
	return session;
}

export const load: PageServerLoad = async ({ params, locals, platform, depends, url }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const session = await requireSession(locals, params.slug);

	const [
		bookSubjectRows,
		seriesSubjectRows,
		authorSubjectRows,
		primaryThreadRow,
		relatedThreads,
		participants,
		readingChoiceRows,
		allBooks
	] = await Promise.all([
		locals.db
			.select({ link: sessionSubjects, book: books })
			.from(sessionSubjects)
			.innerJoin(books, eq(sessionSubjects.subjectId, books.id))
			.where(
				and(
					eq(sessionSubjects.sessionId, session.id),
					eq(sessionSubjects.subjectType, 'book'),
					isNull(books.deletedAt)
				)
			)
			.orderBy(asc(sessionSubjects.status), asc(sessionSubjects.createdAt))
			.all(),
		locals.db
			.select({ link: sessionSubjects, series })
			.from(sessionSubjects)
			.innerJoin(series, eq(sessionSubjects.subjectId, series.id))
			.where(
				and(
					eq(sessionSubjects.sessionId, session.id),
					eq(sessionSubjects.subjectType, 'series'),
					isNull(series.deletedAt)
				)
			)
			.orderBy(asc(sessionSubjects.status), asc(sessionSubjects.createdAt))
			.all(),
		locals.db
			.select({ link: sessionSubjects, author: authors })
			.from(sessionSubjects)
			.innerJoin(authors, eq(sessionSubjects.subjectId, authors.id))
			.where(
				and(
					eq(sessionSubjects.sessionId, session.id),
					eq(sessionSubjects.subjectType, 'author'),
					isNull(authors.deletedAt)
				)
			)
			.orderBy(asc(sessionSubjects.status), asc(sessionSubjects.createdAt))
			.all(),
		findThreadRow(locals.db, primarySessionThreadCondition(locals, session.id)),
		locals.db
			.select({
				thread: threads,
				author: {
					id: users.id,
					displayName: users.displayName,
					avatarUrl: users.avatarUrl
				}
			})
			.from(threads)
			.innerJoin(users, eq(threads.authorUserId, users.id))
			.where(
				and(
					eq(threads.sessionId, session.id),
					ne(threads.sessionThreadRole, 'primary'),
					isNull(threads.deletedAt),
					threadAccessCondition(locals.db, threadViewer(locals))
				)
			)
			.orderBy(desc(threads.lastPostAt), desc(threads.createdAt))
			.all(),
		locals.db
			.select({
				participant: sessionParticipants,
				attendee: { id: attendeeIdentities.id, name: attendeeIdentities.name },
				user: {
					id: users.id,
					displayName: users.displayName,
					avatarUrl: users.avatarUrl
				}
			})
			.from(sessionParticipants)
			.innerJoin(attendeeIdentities, eq(sessionParticipants.attendeeId, attendeeIdentities.id))
			// Guests have an identity but no account; keep them in the list.
			.leftJoin(users, eq(attendeeIdentities.userId, users.id))
			.where(
				and(
					eq(sessionParticipants.sessionId, session.id),
					inArray(sessionParticipants.attendanceStatus, ['attending', 'maybe'])
				)
			)
			.orderBy(asc(attendeeIdentities.name))
			.all(),
		locals.db
			.select({
				choice: sessionReadingChoices,
				attendee: attendeeIdentities,
				user: {
					id: users.id,
					displayName: users.displayName,
					avatarUrl: users.avatarUrl
				},
				subject: books
			})
			.from(sessionReadingChoices)
			.innerJoin(attendeeIdentities, eq(sessionReadingChoices.attendeeId, attendeeIdentities.id))
			.leftJoin(users, eq(attendeeIdentities.userId, users.id))
			.innerJoin(books, eq(sessionReadingChoices.bookId, books.id))
			.where(and(eq(sessionReadingChoices.sessionId, session.id), isNull(books.deletedAt)))
			.orderBy(asc(attendeeIdentities.name), asc(sessionReadingChoices.createdAt))
			.all(),
		locals.db
			.select({
				id: books.id,
				slug: books.slug,
				title: books.title,
				authorText: books.authorText,
				coverUrl: books.coverUrl,
				goodreadsUrl: books.goodreadsUrl,
				hardcoverUrl: books.hardcoverUrl
			})
			.from(books)
			.where(isNull(books.deletedAt))
			.orderBy(asc(books.title))
			.all()
	]);

	const [bookClassifications, seriesClassifications] = await Promise.all([
		loadClassificationsBySubject(
			locals.db,
			'book',
			bookSubjectRows.map(({ book }) => book.id)
		),
		loadClassificationsBySubject(
			locals.db,
			'series',
			seriesSubjectRows.map(({ series }) => series.id)
		)
	]);

	const subjects = [
		...bookSubjectRows.map(({ link, book }) => ({
			kind: 'book' as const,
			link,
			book: { ...book, classifications: bookClassifications[book.id] ?? [] }
		})),
		...seriesSubjectRows.map(({ link, series }) => ({
			kind: 'series' as const,
			link,
			series: { ...series, classifications: seriesClassifications[series.id] ?? [] }
		})),
		...authorSubjectRows.map(({ link, author }) => ({ kind: 'author' as const, link, author }))
	].sort(
		(a, b) =>
			a.link.status.localeCompare(b.link.status) || a.link.createdAt.localeCompare(b.link.createdAt)
	);

	const facilitator = canFacilitate(locals);
	const [attendance, agenda, ownFeedback, presentAttendees] = await Promise.all([
		getAttendanceByAttendee(locals.db, session.id),
		// The member page always shows the member view; facilitator-only items stay in the runner.
		getSessionAgenda(locals.db, session.id, { userId: locals.user.id, canFacilitate: false }),
		getOwnSessionFeedback(locals.db, session.id, locals.user.id),
		// Anyone who came without an RSVP, member or guest, still belongs in the list afterwards.
		locals.db
			.select({
				attendee: { id: attendeeIdentities.id, name: attendeeIdentities.name },
				user: { id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl }
			})
			.from(attendeeIdentities)
			.leftJoin(users, eq(attendeeIdentities.userId, users.id))
			.where(
				sql`EXISTS (SELECT 1 FROM session_attendance a WHERE a.session_id = ${session.id} AND a.attendee_id = ${attendeeIdentities.id} AND a.status = 'present')`
			)
			.all()
	]);

	// One entry per person: attendance outcome first, otherwise the RSVP intent. Absentees drop out.
	type ParticipantEntry = {
		attendeeId: string;
		userId: string | null;
		name: string;
		avatarUrl: string | null;
		status: 'present' | 'attending' | 'maybe';
	};
	const identity = (row: {
		attendee: { id: string; name: string };
		user: { id: string; displayName: string; avatarUrl: string | null } | null;
	}) => ({
		attendeeId: row.attendee.id,
		userId: row.user?.id ?? null,
		name: row.user?.displayName ?? row.attendee.name,
		avatarUrl: row.user?.avatarUrl ?? null
	});
	const participantMap = new Map<string, ParticipantEntry>();
	for (const row of participants) {
		const outcome = attendance[row.attendee.id]?.status;
		if (outcome === 'absent') continue;
		participantMap.set(row.attendee.id, {
			...identity(row),
			status:
				outcome === 'present'
					? 'present'
					: row.participant.attendanceStatus === 'maybe'
						? 'maybe'
						: 'attending'
		});
	}
	for (const row of presentAttendees) {
		if (!participantMap.has(row.attendee.id))
			participantMap.set(row.attendee.id, { ...identity(row), status: 'present' });
	}
	// Guests who only RSVP'd stay private until they have actually attended.
	const participantSummary = [...participantMap.values()]
		.filter((person) => person.userId || facilitator || person.status === 'present')
		.sort((a, b) => a.name.localeCompare(b.name));
	const viewerAttendeeId =
		[...participantMap.values()].find((person) => person.userId === locals.user?.id)?.attendeeId ??
		(
			await locals.db
				.select({ id: attendeeIdentities.id })
				.from(attendeeIdentities)
				.where(eq(attendeeIdentities.userId, locals.user.id))
				.get()
		)?.id;
	const viewerAttended = viewerAttendeeId
		? attendance[viewerAttendeeId]?.status === 'present'
		: false;

	let discussion = null;
	if (primaryThreadRow) {
		depends(threadSubjectsDependency(primaryThreadRow.thread.id));
		discussion = await loadThreadView({
			locals,
			platform,
			row: primaryThreadRow,
			userId: locals.user.id,
			requestedPage: Number.parseInt(url?.searchParams.get('discussionPage') ?? '', 10),
			focusPostId: url?.searchParams.get('post') ?? null
		});
	}

	const pendingSuggestionCount = facilitator
		? (await getSessionAgenda(locals.db, session.id, { userId: null, canFacilitate: true })).filter(
				(item) => item.status === 'pending'
			).length
		: 0;

	return {
		session,
		discussion,
		canCreateDiscussion: locals.permissions.has('sessions:edit'),
		relatedThreads,
		participants: participantSummary,
		agenda,
		pendingSuggestionCount,
		canFacilitate: facilitator,
		phase: workflowPhase(session),
		canGiveFeedback: canGiveFeedback(session),
		hasOwnFeedback: Boolean(ownFeedback),
		viewerAttended,
		canDeclineRsvp: canDeclineSessionRsvp(session),
		canRsvp: canAcceptSessionRsvps(session),
		attendingCount: await attendingCount(locals.db, session.id),
		currentUserRsvp: await getCurrentUserSessionRsvp(locals.db, session.id, locals.user.id),
		readingChoices: readingChoiceRows,
		myReadingChoices: readingChoiceRows.filter((row) => row.attendee.userId === locals.user?.id),
		allBooks,
		starterSubjects: subjects.filter(({ link }) => link.status === 'starter'),
		featuredSubjects: subjects.filter(({ link }) => link.status === 'featured'),
		discussedSubjects: subjects.filter(({ link }) => link.status === 'discussed'),
		offThemeSubjects: subjects.filter(({ link }) => link.status === 'mentioned_off_theme')
	};
};

const threadActions = createThreadActions({
	resolveThread: async ({ locals, params }: RequestEvent) => {
		const session = await findSession(locals, params.slug!);
		if (!session) return null;
		return locals.db
			.select()
			.from(threads)
			.where(primarySessionThreadCondition(locals, session.id))
			.get();
	},
	afterDelete: ({ params }) => `/sessions/${params.slug}`
});

export const actions: Actions = {
	...threadActions,

	createDiscussion: async ({ locals, params }) => {
		if (!locals.user) throw redirect(302, '/auth/login');
		if (!locals.permissions.has('sessions:edit')) return fail(403, { error: 'Not allowed.' });

		const session = await requireSession(locals, params.slug);
		const existing = await getPrimaryThreadForSession(locals.db, session.id);
		if (existing) return fail(409, { error: 'This session already has a discussion.' });

		const thread = await createPrimarySessionThread({
			db: locals.db,
			session,
			authorUserId: locals.user.id
		});

		const prefs = await getOrCreateNotificationPreferences(locals.db, locals.user.id);
		if (prefs.autoSubscribeOwn) {
			await locals.db
				.insert(subscriptions)
				.values({
					id: newId(),
					userId: locals.user.id,
					threadId: thread.id,
					mode: prefs.defaultSubMode
				})
				.onConflictDoNothing();
		}
		if (session.status === 'current') {
			await subscribeActiveMembersToSessionThread(locals.db, thread.id);
		}

		return { discussionCreated: true };
	},

	suggestAgendaItem: async ({ locals, params, request }) => {
		if (!locals.user) throw redirect(302, '/auth/login');
		const session = await requireSession(locals, params.slug);
		if (session.status === 'past' || session.status === 'cancelled' || session.liveEndedAt) {
			return fail(400, { agendaError: 'This session is over, so the agenda is closed.' });
		}
		const data = await request.formData();
		const title = data.get('title')?.toString().trim() ?? '';
		if (title.length < 3) return fail(400, { agendaError: 'Describe the topic in a few words.' });
		if (title.length > 200)
			return fail(400, { agendaError: 'Keep the topic under 200 characters.' });
		await submitAgendaSuggestion(locals.db, session.id, locals.user.id, {
			title,
			description: data.get('description')?.toString().trim() || null
		});
		return { agendaSuggested: true };
	},

	withdrawAgendaSuggestion: async ({ locals, params, request }) => {
		if (!locals.user) throw redirect(302, '/auth/login');
		const session = await requireSession(locals, params.slug);
		const itemId = (await request.formData()).get('itemId')?.toString();
		if (!itemId) return fail(400, { agendaError: 'Missing suggestion.' });
		await withdrawAgendaSuggestion(locals.db, session.id, itemId, locals.user.id);
		return { agendaWithdrawn: true };
	},

	setRsvp: async ({ locals, params, request, platform }) => {
		if (!locals.user) {
			throw redirect(302, '/auth/login');
		}

		const data = await request.formData();
		const status = data.get('status')?.toString();
		if (status !== 'registered' && status !== 'declined') {
			return fail(400, { error: 'Invalid RSVP response.' });
		}

		const session = await requireSession(locals, params.slug);

		return setMemberRsvp({
			db: locals.db,
			platform,
			user: locals.user,
			session,
			status
		});
	},

	upsertReadingChoice: async ({ locals, params, request, platform }) => {
		if (!locals.user) throw redirect(302, '/auth/login');
		const session = await requireSession(locals, params.slug);

		const data = await request.formData();
		const bookId = data.get('bookId')?.toString();
		const bookUrl = data.get('url')?.toString().trim() ?? '';
		const previousBookId = data.get('previousBookId')?.toString();
		const readingStatus = data.get('readingStatus')?.toString();
		if (!isSessionReadingStatus(readingStatus)) {
			return fail(400, { readingChoiceError: 'Choose a reading status.' });
		}

		const attendee = await getOrCreateMemberAttendee(locals.db, locals.user);
		if (bookUrl) {
			const links = detectSubjectLinks(bookUrl);
			if (links.length !== 1 || links[0].subjectKind !== 'book') {
				return fail(400, {
					readingChoiceError: 'Use one Goodreads or Hardcover book URL.'
				});
			}
			const result = await ensureSubjectSource(locals.db, links[0], platform?.env, {
				sessionReadingChoice: {
					sessionId: session.id,
					attendeeId: attendee.id,
					readingStatus,
					previousBookId
				}
			});
			return result.resolvedSubjectId
				? { readingChoiceSaved: true }
				: { readingChoiceQueued: true };
		}
		if (!bookId) {
			return fail(400, { readingChoiceError: 'Choose a book or enter a book URL.' });
		}
		const subject = await locals.db
			.select({ id: books.id })
			.from(books)
			.where(and(eq(books.id, bookId), isNull(books.deletedAt)))
			.get();
		if (!subject) return fail(404, { readingChoiceError: 'That title is unavailable.' });

		await upsertSessionReadingChoice(locals.db, {
			sessionId: session.id,
			attendeeId: attendee.id,
			bookId,
			readingStatus
		});
		if (previousBookId && previousBookId !== bookId) {
			await removeSessionReadingChoice(locals.db, {
				sessionId: session.id,
				attendeeId: attendee.id,
				bookId: previousBookId
			});
		}
		return { readingChoiceSaved: true };
	},

	removeReadingChoice: async ({ locals, params, request }) => {
		if (!locals.user) throw redirect(302, '/auth/login');
		const session = await requireSession(locals, params.slug);

		const data = await request.formData();
		const bookId = data.get('bookId')?.toString();
		if (!bookId) {
			return fail(400, { readingChoiceError: 'Missing reading choice.' });
		}
		const attendee = await getOrCreateMemberAttendee(locals.db, locals.user);
		await removeSessionReadingChoice(locals.db, {
			sessionId: session.id,
			attendeeId: attendee.id,
			bookId
		});
		return { readingChoiceRemoved: true };
	}
};
