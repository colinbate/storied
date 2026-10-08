import type { ReminderSession, ReminderRecipient } from '$shared/session-reminder-email';
import { sessionOccursTomorrow } from '$shared/session-reminder-email';
export { sessionOccursTomorrow, formatSessionDate } from '$shared/session-reminder-email';
import { deliverSessionReminder } from '$shared/session-reminder-delivery';
import type { HandlerContext } from '../dispatch';
import type { Env } from '../env';
import { sendEmail } from './email';

async function selectPublishedSessions(env: Env): Promise<ReminderSession[]> {
	const result = await env.DB.prepare(
		`SELECT id, slug, title, starts_at, timezone, location_name, astro_path, is_public
		   FROM sessions
		  WHERE status IN ('current', 'scheduled') AND starts_at IS NOT NULL`
	).all<ReminderSession>();
	return result.results ?? [];
}

async function selectAttendingRecipients(
	env: Env,
	sessionId: string
): Promise<ReminderRecipient[]> {
	const result = await env.DB.prepare(
		`SELECT participant.id AS participant_id,
		        attendee.id AS attendee_id,
		        attendee.name AS attendee_name,
		        attendee.email AS email,
		        attendee.user_id AS user_id,
		        member.timezone AS timezone,
		        participant.confirmation_token AS confirmation_token
		   FROM session_participants participant
		   INNER JOIN attendee_identities attendee ON attendee.id = participant.attendee_id
		   LEFT JOIN users member ON member.id = attendee.user_id
		  WHERE participant.session_id = ?
		    AND participant.attendance_status = 'attending'
		    AND attendee.email IS NOT NULL`
	)
		.bind(sessionId)
		.all<ReminderRecipient>();
	return (result.results ?? []).filter((recipient) =>
		/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email.trim())
	);
}

/** Run by the 21:00 UTC cron and send one successful reminder per identity and schedule revision. */
export async function runSessionReminders({ env }: HandlerContext, at?: Date): Promise<void> {
	const now = at ?? new Date();
	const nowIso = now.toISOString();
	const sessions = (await selectPublishedSessions(env)).filter((session) =>
		sessionOccursTomorrow(session, now)
	);
	console.log(`[SESSION REMINDER] ${sessions.length} session(s) occur tomorrow at ${nowIso}.`);

	for (const session of sessions) {
		const recipients = await selectAttendingRecipients(env, session.id);
		const totals = { sent: 0, failed: 0, skipped: 0 };
		for (const recipient of recipients) {
			try {
				const status = await deliverSessionReminder(
					env.DB,
					session.id,
					recipient.attendee_id,
					(email) => sendEmail(env, email),
					{ now: at }
				);
				totals[status] += 1;
			} catch (error) {
				totals.failed += 1;
				console.error(
					`[SESSION REMINDER] Failed for session=${session.id} attendee=${recipient.attendee_id}:`,
					error
				);
			}
		}
		console.log(
			`[SESSION REMINDER] session=${session.id} recipients=${recipients.length} sent=${totals.sent} failed=${totals.failed} skipped=${totals.skipped}`
		);
	}
}
