import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sessions, threads, users } from '$lib/server/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _eq: any = eq;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _and: any = and;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _isNull: any = isNull;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _desc: any = desc;

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.db
		.select()
		.from(sessions)
		.where(_eq(sessions.slug, params.slug))
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
		.innerJoin(users, _eq(threads.authorUserId, users.id))
		.where(_and(_eq(threads.sessionId, session.id), _isNull(threads.deletedAt)))
		.orderBy(_desc(threads.createdAt))
		.all();

	return json(sessionThreads, {
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'public, max-age=300'
		}
	});
};
