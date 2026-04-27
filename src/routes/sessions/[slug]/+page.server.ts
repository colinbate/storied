import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	books,
	posts,
	series,
	sessionParticipantSubjects,
	sessionParticipants,
	sessionSubjects,
	sessions,
	subscriptions,
	threads,
	users
} from '$lib/server/db/schema';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { newId } from '$lib/server/ids';
import { renderMarkdown } from '$lib/server/markdown';
import { publishWorkerMessage } from '$lib/server/worker-queue';
import { getOrCreateNotificationPreferences } from '$lib/server/notification-preferences';
import { getCurrentUserSessionRsvp, isFutureSession, setMemberRsvp } from '$lib/server/rsvp';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const session = await locals.db
		.select()
		.from(sessions)
		.where(eq(sessions.slug, params.slug))
		.get();

	if (!session) throw error(404, 'Session not found');

	const [bookSubjectRows, seriesSubjectRows, sessionThreads, participants, participantSubjectRows] =
		await Promise.all([
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
					thread: threads,
					author: {
						id: users.id,
						displayName: users.displayName,
						avatarUrl: users.avatarUrl
					}
				})
				.from(threads)
				.innerJoin(users, eq(threads.authorUserId, users.id))
				.where(and(eq(threads.sessionId, session.id), isNull(threads.deletedAt)))
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
				.innerJoin(users, eq(sessionParticipants.userId, users.id))
				.where(eq(sessionParticipants.sessionId, session.id))
				.orderBy(asc(users.displayName))
				.all(),
			locals.db
				.select({
					read: sessionParticipantSubjects,
					user: {
						id: users.id,
						displayName: users.displayName,
						avatarUrl: users.avatarUrl
					}
				})
				.from(sessionParticipantSubjects)
				.innerJoin(users, eq(sessionParticipantSubjects.userId, users.id))
				.where(eq(sessionParticipantSubjects.sessionId, session.id))
				.orderBy(desc(sessionParticipantSubjects.isPrimaryPick), asc(users.displayName))
				.all()
		]);

	const subjects = [
		...bookSubjectRows.map(({ link, book }) => ({ kind: 'book' as const, link, book })),
		...seriesSubjectRows.map(({ link, series }) => ({ kind: 'series' as const, link, series }))
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

	const subjectReaders = participantSubjectRows.reduce((map, row) => {
		const key = `${row.read.subjectType}:${row.read.subjectId}`;
		const existing = map.get(key) ?? [];
		existing.push(row);
		map.set(key, existing);
		return map;
	}, new Map<string, typeof participantSubjectRows>());

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
		canRsvp: isFutureSession(session),
		currentUserRsvp: await getCurrentUserSessionRsvp(locals.db, session.id, locals.user.id),
		subjectReaders: Object.fromEntries(subjectReaders),
		starterSubjects: subjects.filter(({ link }) => link.status === 'starter'),
		featuredSubjects: subjects.filter(({ link }) => link.status === 'featured'),
		discussedSubjects: subjects.filter(({ link }) => link.status === 'discussed'),
		offThemeSubjects: subjects.filter(({ link }) => link.status === 'mentioned_off_theme')
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
			.where(eq(sessions.slug, params.slug))
			.get();
		if (!session) throw error(404, 'Session not found');

		const thread = await locals.db
			.select()
			.from(threads)
			.where(
				and(
					eq(threads.sessionId, session.id),
					eq(threads.sessionThreadRole, 'primary'),
					isNull(threads.deletedAt)
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
		if (!bodySource) {
			return fail(400, { error: 'Reply cannot be empty.' });
		}

		const postId = newId();
		const now = new Date().toISOString();
		await locals.db.insert(posts).values({
			id: postId,
			threadId: thread.id,
			authorUserId: locals.user.id,
			bodySource,
			bodyHtml: renderMarkdown(bodySource)
		});

		await locals.db
			.update(threads)
			.set({
				replyCount: thread.replyCount + 1,
				lastPostAt: now,
				updatedAt: now
			})
			.where(eq(threads.id, thread.id));

		const existingSub = await locals.db
			.select()
			.from(subscriptions)
			.where(and(eq(subscriptions.userId, locals.user.id), eq(subscriptions.threadId, thread.id)))
			.get();

		if (!existingSub) {
			const prefs = await getOrCreateNotificationPreferences(locals.db, locals.user.id);
			if (prefs.autoSubscribeOwn) {
				await locals.db.insert(subscriptions).values({
					id: newId(),
					userId: locals.user.id,
					threadId: thread.id,
					mode: prefs.defaultSubMode
				});
			}
		}

		await publishWorkerMessage(platform?.env.WORKER_QUEUE, 'notifications.thread-reply', {
			threadId: thread.id,
			postId,
			replyAuthorUserId: locals.user.id,
			baseUrl: url.origin
		});

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
			.where(eq(sessions.slug, params.slug))
			.get();
		if (!session) throw error(404, 'Session not found');

		const thread = await locals.db
			.select()
			.from(threads)
			.where(
				and(
					eq(threads.sessionId, session.id),
					eq(threads.sessionThreadRole, 'primary'),
					isNull(threads.deletedAt)
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
			.where(eq(sessions.slug, params.slug))
			.get();
		if (!session) throw error(404, 'Session not found');

		return setMemberRsvp({
			db: locals.db,
			platform,
			user: locals.user,
			session,
			status
		});
	}
};
