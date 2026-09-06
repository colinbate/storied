import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { asc, eq } from 'drizzle-orm';
import { attendeeIdentities, sessionParticipants, sessions } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/auth';
import { getAttendanceByAttendee } from '$lib/server/session-workflow';

function csv(value: string | null) {
	const text = value ?? '';
	return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	requirePermission(locals, 'sessions:edit');
	const session = await locals.db
		.select()
		.from(sessions)
		.where(eq(sessions.slug, params.slug))
		.get();
	if (!session) throw error(404, 'Session not found');
	const rows = await locals.db
		.select({ participant: sessionParticipants, attendee: attendeeIdentities })
		.from(sessionParticipants)
		.innerJoin(attendeeIdentities, eq(sessionParticipants.attendeeId, attendeeIdentities.id))
		.where(eq(sessionParticipants.sessionId, session.id))
		.orderBy(asc(attendeeIdentities.name))
		.all();
	const attendance = await getAttendanceByAttendee(locals.db, session.id);
	const lines = [
		[
			'Name',
			'Email',
			'Member ID',
			'RSVP',
			'Attendance',
			'Source',
			'Note',
			'Created At',
			'Updated At'
		].join(','),
		...rows.map(({ participant, attendee }) =>
			[
				participant.nameSnapshot,
				participant.emailSnapshot,
				attendee.userId,
				participant.attendanceStatus,
				attendance[attendee.id]?.status ?? '',
				participant.rsvpSource,
				participant.note,
				participant.createdAt,
				participant.updatedAt
			]
				.map(csv)
				.join(',')
		)
	];
	return new Response(lines.join('\n'), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${session.slug}-attendees.csv"`
		}
	});
};
