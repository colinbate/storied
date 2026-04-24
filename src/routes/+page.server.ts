import type { PageServerLoad } from './$types';
import { categories, sessions, threads, users } from '$lib/server/db/schema';
import { eq, isNull, desc, asc, and, count } from 'drizzle-orm';
import { SESSION_DISCUSSIONS_CATEGORY_ID } from '$lib/server/discussions';

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
		featuredDiscussion,
		pastSessions: currentSessions
			.filter((session) => session.status === 'past')
			.reverse()
			.slice(0, 2)
	};
};
