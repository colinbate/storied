import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { createEvent } from 'ics';
import { sessions } from '$lib/server/db/schema';
import { getCurrentUserSessionRsvp } from '$lib/server/rsvp';
import { sessionAccessCondition } from '$lib/server/session-lifecycle';
import { sessionStartDate } from '$shared/session-lifecycle';
import { NOTIFICATION_FROM_ADDRESS, ORGANIZATION_NAME, PRIMARY_ORIGIN } from '$shared/brand';

const calendarStatuses = new Set(['attending', 'waitlisted', 'attended']);

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw redirect(302, '/auth/login');

	const session = await locals.db
		.select()
		.from(sessions)
		.where(and(eq(sessions.slug, params.slug), sessionAccessCondition(locals)))
		.get();
	if (!session) throw error(404, 'Session not found');

	const participant = await getCurrentUserSessionRsvp(locals.db, session.id, locals.user.id);
	if (!participant || !calendarStatuses.has(participant.attendanceStatus)) {
		throw error(404, 'Calendar file unavailable for this RSVP.');
	}

	const start = sessionStartDate(session);
	if (!start || !session.durationMinutes) {
		throw error(404, 'Calendar file unavailable for this session.');
	}

	const theme = session.themeTitle ?? session.theme;
	const { error: calendarError, value } = createEvent({
		title: `${ORGANIZATION_NAME} Meeting`,
		start: [
			start.getUTCFullYear(),
			start.getUTCMonth() + 1,
			start.getUTCDate(),
			start.getUTCHours(),
			start.getUTCMinutes()
		],
		startInputType: 'utc',
		duration: { minutes: session.durationMinutes },
		description: theme ? `Theme: ${theme}` : undefined,
		location: session.locationName ?? undefined,
		url: new URL(`/sessions/${session.slug}`, PRIMARY_ORIGIN).toString(),
		organizer: { name: ORGANIZATION_NAME, email: NOTIFICATION_FROM_ADDRESS },
		uid: `${session.id}@${new URL(PRIMARY_ORIGIN).hostname}`,
		status: session.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'
	});
	if (calendarError || !value) throw error(500, 'Failed to generate calendar file.');

	return new Response(value, {
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Content-Disposition': `attachment; filename="bermuda-triangle-society-${session.slug}.ics"`,
			'Cache-Control': 'private, no-store'
		}
	});
};
