import { sendEmail } from '$lib/server/email';
import type { attendeeIdentities, sessionParticipants, sessions } from '$lib/server/db/schema';
import { PRIMARY_ORIGIN, PUBLIC_ORIGIN } from '$shared/brand';
import { DEFAULT_TIMEZONE, isOffsetlessDateTime, zonedDateTimeToDate } from '$lib/timezone';
import { createSessionCalendarLinks } from '$shared/session-calendar-links';

type StoriedSession = typeof sessions.$inferSelect;
type Participant = typeof sessionParticipants.$inferSelect;
type Attendee = typeof attendeeIdentities.$inferSelect;

export function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

export function sessionPublicUrl(session: StoriedSession, attendee: Pick<Attendee, 'userId'>) {
	if (attendee.userId || !session.isPublic)
		return new URL(`/sessions/${session.slug}`, PRIMARY_ORIGIN).toString();
	return new URL(
		session.astroPath?.trim() || `/sessions/${session.slug}`,
		PUBLIC_ORIGIN
	).toString();
}

export function formatSessionDate(session: StoriedSession) {
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
		minute: '2-digit',
		timeZoneName: 'short'
	}).format(date);
}

export function sessionDetailsHtml(session: StoriedSession, attendee: Pick<Attendee, 'userId'>) {
	const location = session.locationName
		? `<p><strong>Location:</strong> ${escapeHtml(session.locationName)}</p>`
		: '';
	return `<div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0"><h3 style="margin:0 0 8px;color:#6d28d9">${escapeHtml(session.title)}</h3><p><strong>When:</strong> ${escapeHtml(formatSessionDate(session))}</p>${location}<p><a href="${escapeHtml(sessionPublicUrl(session, attendee))}">View session details</a></p></div>`;
}

function calendarLinks(session: StoriedSession, attendee: Attendee) {
	const detailsUrl = sessionPublicUrl(session, attendee);
	const publicPath = session.astroPath?.trim().replace(/\/$/, '');
	const icsUrl = attendee.userId
		? new URL(`/sessions/${session.slug}/calendar.ics`, PRIMARY_ORIGIN).toString()
		: session.isPublic && publicPath
			? new URL(`${publicPath}.ics`, PUBLIC_ORIGIN).toString()
			: null;
	return createSessionCalendarLinks(session, { detailsUrl, icsUrl });
}

function calendarLinksText(session: StoriedSession, attendee: Attendee) {
	const links = calendarLinks(session, attendee);
	return links.length > 0
		? `\nAdd to calendar:\n${links.map((link) => `${link.label}: ${link.href}`).join('\n')}\n`
		: '';
}

function calendarLinksHtml(session: StoriedSession, attendee: Attendee) {
	const links = calendarLinks(session, attendee);
	return links.length > 0
		? `<p>Add to ${links.map((link) => `<a href="${escapeHtml(link.href)}">${link.label}</a>`).join(' ')}</p>`
		: '';
}

export function emailWrapper(content: string) {
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
		`Hi ${attendee.name},\n\nYour RSVP for ${session.title} is confirmed.\n${formatSessionDate(session)}\n${session.locationName ?? ''}\nView session details: ${sessionPublicUrl(session, attendee)}\n${calendarLinksText(session, attendee)}${cancelUrl ?? ''}`,
		emailWrapper(
			`<h2>You're registered!</h2><p>Hi ${escapeHtml(attendee.name)},</p>${sessionDetailsHtml(session, attendee)}${calendarLinksHtml(session, attendee)}${cancelUrl ? `<p><a href="${escapeHtml(cancelUrl)}">Cancel this registration</a></p>` : ''}`
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
		`Hi ${attendee.name},\n\nThis session is full, so you have been added to the waitlist. We'll email you when your place is confirmed.\n${formatSessionDate(session)}\nView session details: ${sessionPublicUrl(session, attendee)}\n${calendarLinksText(session, attendee)}${cancelUrl ?? ''}`,
		emailWrapper(
			`<h2>You're on the waitlist</h2><p>Hi ${escapeHtml(attendee.name)},</p><p>We'll let you know if a spot opens.</p>${sessionDetailsHtml(session, attendee)}${calendarLinksHtml(session, attendee)}${cancelUrl ? `<p><a href="${escapeHtml(cancelUrl)}">Leave the waitlist</a></p>` : ''}`
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
		`Hi ${attendee.name},\n\nA spot opened up and your RSVP is now confirmed.\n${formatSessionDate(session)}\nView session details: ${sessionPublicUrl(session, attendee)}\n${calendarLinksText(session, attendee)}${cancelUrl ?? ''}`,
		emailWrapper(
			`<h2>A spot opened up!</h2><p>Hi ${escapeHtml(attendee.name)},</p><p>Your RSVP is now confirmed.</p>${sessionDetailsHtml(session, attendee)}${calendarLinksHtml(session, attendee)}${cancelUrl ? `<p><a href="${escapeHtml(cancelUrl)}">Cancel this registration</a></p>` : ''}`
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
		emailWrapper(
			`<h2>Registration cancelled</h2><p>Hi ${escapeHtml(attendee.name)},</p><p>Your registration has been cancelled.</p>${sessionDetailsHtml(session, attendee)}`
		)
	);
}
