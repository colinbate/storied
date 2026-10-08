import { PRIMARY_ORIGIN, PUBLIC_ORIGIN } from './brand';
import {
	formatSessionDateInTimeZone,
	sessionOccursOnNextLocalDay
} from './session-reminder-timezone';
import { formatSessionTimes } from './session-time';

export interface ReminderSession {
	id: string;
	slug: string;
	title: string;
	starts_at: string;
	timezone: string;
	location_name: string | null;
	astro_path: string | null;
	is_public: number;
}

export interface ReminderRecipient {
	participant_id: string;
	attendee_id: string;
	attendee_name: string;
	email: string;
	confirmation_token: string | null;
	user_id: string | null;
	timezone: string | null;
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

function publicSessionUrl(session: ReminderSession, recipient: ReminderRecipient): string {
	if (recipient.user_id || !session.is_public)
		return new URL(`/sessions/${session.slug}`, PRIMARY_ORIGIN).toString();
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

export function renderSessionReminderEmail(
	session: ReminderSession,
	recipient: ReminderRecipient,
	now = new Date()
) {
	const tomorrow = sessionOccursTomorrow(session, now);
	const timing = tomorrow ? 'tomorrow' : 'soon';
	const times = formatSessionTimes(
		{ startsAt: session.starts_at, timezone: session.timezone },
		recipient.timezone
	);
	const when = times.local ? `${times.event}\nYour time: ${times.local}` : times.event;
	const sessionUrl = publicSessionUrl(session, recipient);
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
		subject: `Reminder: ${session.title} is ${timing}`,
		textBody: `Hi ${recipient.attendee_name},\n\nJust a reminder that you're registered for ${session.title} ${timing}.\n\nWhen: ${when}${locationLine}\n\nView session details: ${sessionUrl}${cancelLine}`,
		htmlBody: `<div style="font-family:system-ui,-apple-system,sans-serif;color:#1f2937;line-height:1.6;max-width:600px;margin:0 auto;padding:20px"><h2>Your session reminder</h2><p>Hi ${escapeHtml(recipient.attendee_name)},</p><p>Just a reminder that you’re registered for this session.</p><div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0"><h3 style="margin:0 0 8px;color:#6d28d9">${escapeHtml(session.title)}</h3><p style="margin:4px 0"><strong>When:</strong> ${escapeHtml(when).replaceAll('\n', '<br>')}</p>${locationHtml}<p style="margin:12px 0 0"><a href="${escapeHtml(sessionUrl)}">View session details</a></p></div>${cancelHtml}</div>`
	};
}
