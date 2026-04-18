import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sessions, threads, users } from '$lib/server/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.db
		.select()
		.from(sessions)
		.where(eq(sessions.slug, params.slug))
		.get();

	if (!session) throw error(404, 'Session not found');

	const sessionThreads = await locals.db
		.select({
			id: threads.id,
			title: threads.title,
			slug: threads.slug,
			replyCount: threads.replyCount,
			createdAt: threads.createdAt,
			authorName: users.displayName
		})
		.from(threads)
		.innerJoin(users, eq(threads.authorUserId, users.id))
		.where(and(eq(threads.sessionId, session.id), isNull(threads.deletedAt)))
		.orderBy(desc(threads.createdAt))
		.all();

	return json(sessionThreads, {
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'public, max-age=300'
		}
	});
};
