import { PRIMARY_ORIGIN, PUBLIC_ORIGIN } from '$shared/brand';
import {
	formatSessionDateInTimeZone,
	sessionOccursOnNextLocalDay
} from '$shared/session-reminder-timezone';
import type { HandlerContext } from '../dispatch';
import type { Env } from '../env';
import { generateId } from '../shared/ids';
import { sendEmail } from './email';

interface ReminderSession {
	id: string;
	slug: string;
	title: string;
	starts_at: string;
	timezone: string;
	location_name: string | null;
	astro_path: string | null;
}

interface ReminderRecipient {
	participant_id: string;
	attendee_id: string;
	attendee_name: string;
	email: string;
	confirmation_token: string | null;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export function sessionOccursTomorrow(
	session: Pick<ReminderSession, 'starts_at' | 'timezone'>,
	now: Date
): boolean {
	return sessionOccursOnNextLocalDay(session.starts_at, session.timezone, now);
}

export function formatSessionDate(
	session: Pick<ReminderSession, 'starts_at' | 'timezone'>
): string {
	return formatSessionDateInTimeZone(session.starts_at, session.timezone);
}

function publicSessionUrl(session: ReminderSession): string {
	return new URL(
		session.astro_path?.trim() || `/sessions/${session.slug}`,
		PUBLIC_ORIGIN
	).toString();
}

function cancellationUrl(recipient: ReminderRecipient): string | null {
	return recipient.confirmation_token
		? new URL(`/cancel/${recipient.confirmation_token}`, PRIMARY_ORIGIN).toString()
		: null;
}

function renderReminderEmail(session: ReminderSession, recipient: ReminderRecipient) {
	const when = formatSessionDate(session);
	const sessionUrl = publicSessionUrl(session);
	const cancelUrl = cancellationUrl(recipient);
	const locationLine = session.location_name ? `\nLocation: ${session.location_name}` : '';
	const cancelLine = cancelUrl ? `\n\nCan’t make it? Cancel your registration: ${cancelUrl}` : '';
	const locationHtml = session.location_name
		? `<p style="margin:4px 0"><strong>Location:</strong> ${escapeHtml(session.location_name)}</p>`
		: '';
	const cancelHtml = cancelUrl
		? `<p style="margin-top:24px"><a href="${escapeHtml(cancelUrl)}" style="color:#6d28d9">Cancel this registration</a></p>`
		: '';

	return {
		subject: `Reminder: ${session.title} is tomorrow`,
		textBody: `Hi ${recipient.attendee_name},\n\nJust a reminder that you're registered for ${session.title} tomorrow.\n\nWhen: ${when}${locationLine}\n\nView session details: ${sessionUrl}${cancelLine}`,
		htmlBody: `<div style="font-family:system-ui,-apple-system,sans-serif;color:#1f2937;line-height:1.6;max-width:600px;margin:0 auto;padding:20px"><h2>See you tomorrow!</h2><p>Hi ${escapeHtml(recipient.attendee_name)},</p><p>Just a reminder that you’re registered for tomorrow’s session.</p><div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0"><h3 style="margin:0 0 8px;color:#6d28d9">${escapeHtml(session.title)}</h3><p style="margin:4px 0"><strong>When:</strong> ${escapeHtml(when)}</p>${locationHtml}<p style="margin:12px 0 0"><a href="${escapeHtml(sessionUrl)}">View session details</a></p></div>${cancelHtml}</div>`
	};
}

async function selectCurrentSessions(env: Env): Promise<ReminderSession[]> {
	const result = await env.DB.prepare(
		`SELECT id, slug, title, starts_at, timezone, location_name, astro_path
		   FROM sessions
		  WHERE status = 'current' AND starts_at IS NOT NULL`
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
		        participant.confirmation_token AS confirmation_token
		   FROM session_participants participant
		   INNER JOIN attendee_identities attendee ON attendee.id = participant.attendee_id
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

async function reserveDelivery(
	env: Env,
	session: ReminderSession,
	recipient: ReminderRecipient,
	nowIso: string
): Promise<string | null> {
	const id = generateId();
	const result = await env.DB.prepare(
		`INSERT INTO session_reminder_deliveries (
			id, session_id, attendee_id, participant_id, recipient_email,
			status, attempted_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, 'sending', ?, ?, ?)
		ON CONFLICT(session_id, attendee_id) DO NOTHING`
	)
		.bind(
			id,
			session.id,
			recipient.attendee_id,
			recipient.participant_id,
			recipient.email,
			nowIso,
			nowIso,
			nowIso
		)
		.run();
	return result.meta.changes === 1 ? id : null;
}

async function sendReminder(
	env: Env,
	session: ReminderSession,
	recipient: ReminderRecipient,
	nowIso: string
): Promise<'sent' | 'failed' | 'skipped'> {
	const deliveryId = await reserveDelivery(env, session, recipient, nowIso);
	if (!deliveryId) return 'skipped';

	const email = renderReminderEmail(session, recipient);
	const result = await sendEmail(env, { to: recipient.email, ...email });
	await env.DB.prepare(
		`UPDATE session_reminder_deliveries
		    SET status = ?, failure_reason = ?, sent_at = ?, updated_at = ?
		  WHERE id = ?`
	)
		.bind(
			result.success ? 'sent' : 'failed',
			result.success ? null : (result.error ?? 'Unknown email error'),
			result.success ? nowIso : null,
			nowIso,
			deliveryId
		)
		.run();
	return result.success ? 'sent' : 'failed';
}

/** Run by the 21:00 UTC cron and send one reminder per attending identity. */
export async function runSessionReminders({ env }: HandlerContext): Promise<void> {
	const now = new Date();
	const nowIso = now.toISOString();
	const sessions = (await selectCurrentSessions(env)).filter((session) =>
		sessionOccursTomorrow(session, now)
	);
	console.log(`[SESSION REMINDER] ${sessions.length} session(s) occur tomorrow at ${nowIso}.`);

	for (const session of sessions) {
		const recipients = await selectAttendingRecipients(env, session.id);
		const totals = { sent: 0, failed: 0, skipped: 0 };
		for (const recipient of recipients) {
			try {
				const status = await sendReminder(env, session, recipient, nowIso);
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
