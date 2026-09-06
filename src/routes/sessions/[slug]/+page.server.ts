import { sessionAccessCondition } from '$lib/server/session-lifecycle';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	books,
	authors,
	attendeeIdentities,
	posts,
	series,
	sessionReadingChoices,
	sessionParticipants,
	sessionSubjects,
	sessions,
	subscriptions,
	threads,
	users
} from '$lib/server/db/schema';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { newId } from '$lib/server/ids';
import { createThreadReply } from '$lib/server/thread-replies';
import {
	attendingCount,
	canAcceptSessionRsvps,
	canDeclineSessionRsvp,
	getCurrentUserSessionRsvp,
	getOrCreateMemberAttendee,
	setMemberRsvp
} from '$lib/server/rsvp';
import { PostImageUploadError, readPostImage } from '$lib/server/post-images';
import { threadAccessCondition, threadViewer } from '$lib/server/thread-access';
import { loadClassificationsBySubject } from '$lib/server/classifications';
import { detectSubjectLinks } from '$lib/server/book-links';
import { ensureSubjectSource } from '$lib/server/subject-sources';
import {
	isSessionReadingStatus,
	removeSessionReadingChoice,
	upsertSessionReadingChoice
} from '$lib/server/session-reading';

export const load: PageServerLoad = async ({ params, locals, platform }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const session = await locals.db
		.select()
		.from(sessions)
		.where(and(eq(sessions.slug, params.slug), sessionAccessCondition(locals)))
		.get();

	if (!session) throw error(404, 'Session not found');

	const [
		bookSubjectRows,
		seriesSubjectRows,
		authorSubjectRows,
		sessionThreads,
		participants,
		readingChoiceRows,
		allBooks
	] = await Promise.all([
		locals.db
			.select({
				link: sessionSubjects,
				book: books
			})
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
			.select({
				link: sessionSubjects,
				series
			})
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
			.select({
				link: sessionSubjects,
				author: authors
			})
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
					isNull(threads.deletedAt),
					threadAccessCondition(locals.db, threadViewer(locals))
				)
			)
			.orderBy(desc(threads.createdAt))
			.all(),
		locals.db
			.select({
				participant: sessionParticipants,
				user: {
					id: users.id,
					displayName: users.displayName,
					avatarUrl: users.avatarUrl
				}
			})
			.from(sessionParticipants)
			.innerJoin(attendeeIdentities, eq(sessionParticipants.attendeeId, attendeeIdentities.id))
			.innerJoin(users, eq(attendeeIdentities.userId, users.id))
			.where(
				and(
					eq(sessionParticipants.sessionId, session.id),
					inArray(sessionParticipants.attendanceStatus, ['attending', 'maybe', 'attended'])
				)
			)
			.orderBy(asc(users.displayName))
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

	const primaryThread =
		sessionThreads.find(({ thread }) => thread.sessionThreadRole === 'primary') ??
		sessionThreads[0] ??
		null;

	const [primaryPosts, primarySubscription] = primaryThread
		? await Promise.all([
				locals.db
					.select({
						post: posts,
						author: {
							id: users.id,
							displayName: users.displayName,
							avatarUrl: users.avatarUrl
						}
					})
					.from(posts)
					.innerJoin(users, eq(posts.authorUserId, users.id))
					.where(and(eq(posts.threadId, primaryThread.thread.id), isNull(posts.deletedAt)))
					.orderBy(asc(posts.createdAt))
					.all(),
				locals.db
					.select()
					.from(subscriptions)
					.where(
						and(
							eq(subscriptions.userId, locals.user.id),
							eq(subscriptions.threadId, primaryThread.thread.id)
						)
					)
					.get()
			])
		: [[], null];

	return {
		session,
		primaryThread,
		primaryPosts,
		primarySubscriptionMode: (primarySubscription?.mode ?? 'none') as
			| 'immediate'
			| 'daily_digest'
			| 'mute'
			| 'none',
		relatedThreads: sessionThreads.filter(({ thread }) => thread.id !== primaryThread?.thread.id),
		participants,
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
		offThemeSubjects: subjects.filter(({ link }) => link.status === 'mentioned_off_theme'),
		fileBaseUrl: platform?.env.FILE_BASE_URL ?? ''
	};
};

export const actions: Actions = {
	reply: async ({ request, locals, params, platform, url }) => {
		if (!locals.user) {
			throw redirect(302, '/auth/login');
		}

		const session = await locals.db
			.select()
			.from(sessions)
			.where(and(eq(sessions.slug, params.slug), sessionAccessCondition(locals)))
			.get();
		if (!session) throw error(404, 'Session not found');

		const thread = await locals.db
			.select()
			.from(threads)
			.where(
				and(
					eq(threads.sessionId, session.id),
					eq(threads.sessionThreadRole, 'primary'),
					isNull(threads.deletedAt),
					threadAccessCondition(locals.db, threadViewer(locals))
				)
			)
			.get();

		if (!thread) {
			return fail(400, { error: 'This session does not have a primary discussion thread yet.' });
		}

		if (thread.isLocked) {
			return fail(403, { error: 'This discussion is locked.' });
		}

		const data = await request.formData();
		const bodySource = data.get('body')?.toString()?.trim();
		const imageInput = readPostImage(data);
		if (!bodySource) {
			return fail(400, { error: 'Reply cannot be empty.' });
		}
		if (imageInput.error) {
			return fail(400, { error: imageInput.error });
		}

		try {
			await createThreadReply({
				db: locals.db,
				platform,
				thread,
				authorUserId: locals.user.id,
				bodySource,
				baseUrl: url.origin,
				imageFile: imageInput.file
			});
		} catch (error) {
			if (error instanceof PostImageUploadError) {
				return fail(500, { error: 'The image could not be uploaded. Please try again.' });
			}
			throw error;
		}

		return { success: true };
	},

	setSubscriptionMode: async ({ locals, params, request }) => {
		if (!locals.user) {
			throw redirect(302, '/auth/login');
		}

		const mode = (await request.formData()).get('mode')?.toString();
		if (mode !== 'immediate' && mode !== 'daily_digest' && mode !== 'mute' && mode !== 'none') {
			return fail(400, { error: 'Invalid subscription mode.' });
		}

		const session = await locals.db
			.select()
			.from(sessions)
			.where(and(eq(sessions.slug, params.slug), sessionAccessCondition(locals)))
			.get();
		if (!session) throw error(404, 'Session not found');

		const thread = await locals.db
			.select()
			.from(threads)
			.where(
				and(
					eq(threads.sessionId, session.id),
					eq(threads.sessionThreadRole, 'primary'),
					isNull(threads.deletedAt),
					threadAccessCondition(locals.db, threadViewer(locals))
				)
			)
			.get();
		if (!thread) {
			return fail(400, { error: 'This session does not have a primary discussion thread yet.' });
		}

		if (mode === 'none') {
			await locals.db
				.delete(subscriptions)
				.where(
					and(eq(subscriptions.userId, locals.user.id), eq(subscriptions.threadId, thread.id))
				);
			return { subscriptionMode: 'none' as const };
		}

		const now = new Date().toISOString();
		await locals.db
			.insert(subscriptions)
			.values({
				id: newId(),
				userId: locals.user.id,
				threadId: thread.id,
				mode
			})
			.onConflictDoUpdate({
				target: [subscriptions.userId, subscriptions.threadId],
				set: { mode, updatedAt: now }
			});

		return { subscriptionMode: mode };
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

		const session = await locals.db
			.select()
			.from(sessions)
			.where(and(eq(sessions.slug, params.slug), sessionAccessCondition(locals)))
			.get();
		if (!session) throw error(404, 'Session not found');

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
		const session = await locals.db
			.select()
			.from(sessions)
			.where(and(eq(sessions.slug, params.slug), sessionAccessCondition(locals)))
			.get();
		if (!session) throw error(404, 'Session not found');

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
		const session = await locals.db
			.select()
			.from(sessions)
			.where(and(eq(sessions.slug, params.slug), sessionAccessCondition(locals)))
			.get();
		if (!session) throw error(404, 'Session not found');

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
