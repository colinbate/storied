import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { sessions } from '$lib/server/db/schema';
import { asc, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const rows = await locals.db
		.select()
		.from(sessions)
		.orderBy(asc(sessions.startsAt), desc(sessions.createdAt))
		.all();

	return {
		currentSessions: rows.filter((session) => session.status === 'current'),
		upcomingSessions: rows.filter((session) => session.status === 'draft'),
		pastSessions: rows.filter((session) => session.status === 'past').reverse()
	};
};
