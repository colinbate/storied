import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { sessions } from '$lib/server/db/schema';
import { hasSessionEnded } from '$shared/session-lifecycle';
import { sessionAccessCondition } from '$lib/server/session-lifecycle';
import { getCurrentUserSessionRsvp } from '$lib/server/rsvp';
import { asc, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const rows = await locals.db
		.select()
		.from(sessions)
		.where(sessionAccessCondition(locals))
		.orderBy(asc(sessions.startsAt), desc(sessions.createdAt))
		.all();

	const myRsvps = Object.fromEntries(
		await Promise.all(
			rows.map(async (session) => [
				session.id,
				(await getCurrentUserSessionRsvp(locals.db, session.id, locals.user!.id))
					?.attendanceStatus ?? null
			])
		)
	);
	return {
		myRsvps,
		draftSessions: rows.filter((session) => session.status === 'draft'),
		upcomingSessions: rows.filter(
			(session) => session.status === 'scheduled' && !hasSessionEnded(session)
		),
		cancelledSessions: rows.filter((session) => session.status === 'cancelled'),
		currentSessions: rows.filter((session) => session.status === 'current'),
		pastSessions: rows
			.filter(
				(session) =>
					session.status === 'past' || (session.status === 'scheduled' && hasSessionEnded(session))
			)
			.reverse()
	};
};
