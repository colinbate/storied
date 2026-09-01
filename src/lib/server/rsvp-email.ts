import { sendEmail } from '$lib/server/email';
import type { attendeeIdentities, sessionParticipants, sessions } from '$lib/server/db/schema';
import { PUBLIC_ORIGIN } from '$shared/brand';
import { DEFAULT_TIMEZONE, isOffsetlessDateTime, zonedDateTimeToDate } from '$lib/timezone';

type StoriedSession = typeof sessions.$inferSelect;
type Participant = typeof sessionParticipants.$inferSelect;
type Attendee = typeof attendeeIdentities.$inferSelect;

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

function sessionPublicUrl(session: StoriedSession) {
	return new URL(
		session.astroPath?.trim() || `/sessions/${session.slug}`,
		PUBLIC_ORIGIN
	).toString();
}

function formatSessionDate(session: StoriedSession) {
	const date = !session.startsAt
		? null
		: isOffsetlessDateTime(session.startsAt)
			? zonedDateTimeToDate(session.startsAt, session.timezone ?? DEFAULT_TIMEZONE)
			: new Date(session.startsAt);
	if (!date) return 'Date to be confirmed';
	return new Intl.DateTimeFormat('en-US', {
		timeZone: session.timezone,
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	}).format(date);
}

function details(session: StoriedSession) {
	const location = session.locationName
		? `<p><strong>Location:</strong> ${escapeHtml(session.locationName)}</p>`
		: '';
	return `<div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0"><h3 style="margin:0 0 8px;color:#6d28d9">${escapeHtml(session.title)}</h3><p><strong>When:</strong> ${escapeHtml(formatSessionDate(session))}</p>${location}<p><a href="${escapeHtml(sessionPublicUrl(session))}">View session details</a></p></div>`;
}

function wrapper(content: string) {
	return `<div style="font-family:system-ui,-apple-system,sans-serif;color:#1f2937;line-height:1.6;max-width:600px;margin:0 auto;padding:20px">${content}</div>`;
}

async function deliver(
	platform: App.Platform | undefined,
	to: string | null,
	subject: string,
	textBody: string,
	htmlBody: string
) {
	if (!platform || !to) return { success: true };
	return sendEmail(platform, { to, subject, textBody, htmlBody });
}

export function cancellationUrl(baseUrl: string, participant: Participant) {
	return participant.confirmationToken
		? new URL(`/cancel/${participant.confirmationToken}`, baseUrl).toString()
		: null;
}

export async function sendRegistrationConfirmationEmail(
	platform: App.Platform | undefined,
	session: StoriedSession,
	participant: Participant,
	attendee: Attendee,
	baseUrl: string
) {
	const cancelUrl = cancellationUrl(baseUrl, participant);
	return deliver(
		platform,
		attendee.email,
		`RSVP confirmed: ${session.title}`,
		`Hi ${attendee.name},\n\nYour RSVP for ${session.title} is confirmed.\n${formatSessionDate(session)}\n${cancelUrl ?? ''}`,
		wrapper(
			`<h2>You're registered!</h2><p>Hi ${escapeHtml(attendee.name)},</p>${details(session)}${cancelUrl ? `<p><a href="${escapeHtml(cancelUrl)}">Cancel this registration</a></p>` : ''}`
		)
	);
}

export async function sendWaitlistConfirmationEmail(
	platform: App.Platform | undefined,
	session: StoriedSession,
	participant: Participant,
	attendee: Attendee,
	baseUrl: string
) {
	const cancelUrl = cancellationUrl(baseUrl, participant);
	return deliver(
		platform,
		attendee.email,
		`Waitlisted: ${session.title}`,
		`Hi ${attendee.name},\n\nThis session is full, so you have been added to the waitlist.\n${cancelUrl ?? ''}`,
		wrapper(
			`<h2>You're on the waitlist</h2><p>Hi ${escapeHtml(attendee.name)},</p><p>We'll let you know if a spot opens.</p>${details(session)}${cancelUrl ? `<p><a href="${escapeHtml(cancelUrl)}">Leave the waitlist</a></p>` : ''}`
		)
	);
}

export async function sendWaitlistPromotionEmail(
	platform: App.Platform | undefined,
	session: StoriedSession,
	participant: Participant,
	attendee: Attendee,
	baseUrl: string
) {
	const cancelUrl = cancellationUrl(baseUrl, participant);
	return deliver(
		platform,
		attendee.email,
		`A spot opened up: ${session.title}`,
		`Hi ${attendee.name},\n\nA spot opened up and your RSVP is now confirmed.\n${cancelUrl ?? ''}`,
		wrapper(
			`<h2>A spot opened up!</h2><p>Hi ${escapeHtml(attendee.name)},</p><p>Your RSVP is now confirmed.</p>${details(session)}${cancelUrl ? `<p><a href="${escapeHtml(cancelUrl)}">Cancel this registration</a></p>` : ''}`
		)
	);
}

export async function sendCancellationConfirmationEmail(
	platform: App.Platform | undefined,
	session: StoriedSession,
	attendee: Attendee
) {
	return deliver(
		platform,
		attendee.email,
		`Registration cancelled: ${session.title}`,
		`Hi ${attendee.name},\n\nYour registration for ${session.title} has been cancelled.`,
		wrapper(
			`<h2>Registration cancelled</h2><p>Hi ${escapeHtml(attendee.name)},</p><p>Your registration has been cancelled.</p>${details(session)}`
		)
	);
}
