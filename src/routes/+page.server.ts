import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { categories, sessions, threads, users } from '$lib/server/db/schema';
import { eq, isNull, desc, asc, and, count } from 'drizzle-orm';
import { SESSION_DISCUSSIONS_CATEGORY_ID } from '$lib/server/discussions';
import { getCurrentUserSessionRsvp, isFutureSession, setMemberRsvp } from '$lib/server/rsvp';

export const load: PageServerLoad = async ({ locals }) => {
	// Load categories
	const allCategories = await locals.db
		.select({
			id: categories.id,
			name: categories.name,
			slug: categories.slug,
			description: categories.description,
			size: count(threads.id).as('size')
		})
		.from(categories)
		.leftJoin(threads, and(eq(threads.categoryId, categories.id), isNull(threads.deletedAt)))
		.groupBy(categories.id, categories.name, categories.description, categories.slug)
		.orderBy(asc(categories.sortOrder), asc(categories.name))
		.where(eq(categories.isPrivate, false))
		.all();

	// Load recent threads (not deleted)
	const recentThreads = await locals.db
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
		.where(isNull(threads.deletedAt))
		.orderBy(desc(threads.lastPostAt), desc(threads.createdAt))
		.limit(20)
		.all();

	const currentSessions = await locals.db
		.select()
		.from(sessions)
		.orderBy(asc(sessions.startsAt), desc(sessions.createdAt))
		.all();

	const featuredSession =
		currentSessions.find((session) => session.status === 'current') ??
		currentSessions.find((session) => session.status === 'draft') ??
		null;

	const featuredDiscussion = featuredSession
		? await locals.db
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
						eq(threads.sessionId, featuredSession.id),
						eq(threads.sessionThreadRole, 'primary'),
						eq(threads.categoryId, SESSION_DISCUSSIONS_CATEGORY_ID),
						isNull(threads.deletedAt)
					)
				)
				.get()
		: null;

	return {
		categories: allCategories,
		recentThreads,
		currentSession: featuredSession,
		canRsvpToCurrentSession: featuredSession ? isFutureSession(featuredSession) : false,
		currentSessionRsvp:
			featuredSession && locals.user
				? await getCurrentUserSessionRsvp(locals.db, featuredSession.id, locals.user.id)
				: null,
		featuredDiscussion,
		pastSessions: currentSessions
			.filter((session) => session.status === 'past')
			.reverse()
			.slice(0, 2)
	};
};

export const actions: Actions = {
	setSessionRsvp: async ({ locals, request, platform }) => {
		if (!locals.user) {
			throw redirect(302, '/auth/login');
		}

		const data = await request.formData();
		const sessionSlug = data.get('sessionSlug')?.toString();
		const status = data.get('status')?.toString();
		if (!sessionSlug) {
			return fail(400, { error: 'Missing session.' });
		}
		if (status !== 'registered' && status !== 'declined') {
			return fail(400, { error: 'Invalid RSVP response.' });
		}

		const session = await locals.db
			.select()
			.from(sessions)
			.where(eq(sessions.slug, sessionSlug))
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
