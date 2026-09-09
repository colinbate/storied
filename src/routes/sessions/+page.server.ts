import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { sessions, themes } from '$lib/server/db/schema';
import { hasSessionEnded } from '$shared/session-lifecycle';
import { sessionAccessCondition } from '$lib/server/session-lifecycle';
import { getCurrentUserSessionRsvp } from '$lib/server/rsvp';
import { asc, desc, eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const rawRows = await locals.db
		.select({ session: sessions, themeName: themes.name, themeDescription: themes.description })
		.from(sessions)
		.leftJoin(themes, eq(sessions.themeId, themes.id))
		.where(sessionAccessCondition(locals))
		.orderBy(asc(sessions.startsAt), desc(sessions.createdAt))
		.all();
	const rows = rawRows.map(({ session, themeName, themeDescription }) => ({
		...session,
		themeTitle: themeName ?? session.themeTitle,
		themeSummary: themeDescription ?? session.themeSummary
	}));

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
