import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import type { ORM } from '$lib/server/db';
import {
	attendeeIdentities,
	sessionMessageDeliveries,
	sessionMessages,
	sessionParticipants,
	sessionReminderDeliveries,
	sessions,
	users,
	type SessionAttendanceStatus,
	type SessionMessageKind
} from '$lib/server/db/schema';
import { newId } from '$lib/server/ids';
import { renderMarkdown } from '$lib/server/markdown';
import { sendEmail } from '$lib/server/email';
import {
	emailWrapper,
	escapeHtml,
	formatSessionDate,
	sessionPublicUrl
} from '$lib/server/rsvp-email';
import {
	buildSessionCancellationMessage,
	buildSessionUpdateMessage,
	detectSessionDetailChanges,
	SESSION_MESSAGE_AUDIENCE_LABELS,
	SESSION_MESSAGE_AUDIENCES,
	type SessionMessageAudience,
	type SessionMessageDraft
} from '$shared/session-messages';

type StoriedSession = typeof sessions.$inferSelect;
type SessionMessage = typeof sessionMessages.$inferSelect;

export type SessionMessageRecipient = {
	attendeeId: string;
	name: string;
	email: string;
	userId: string | null;
	audience: SessionMessageAudience;
};

const audienceStatuses: Partial<Record<SessionMessageAudience, SessionAttendanceStatus[]>> = {
	attending: ['attending'],
	waitlisted: ['waitlisted'],
	maybe: ['maybe']
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function selectStatusRecipients(
	db: ORM,
	sessionId: string,
	statuses: SessionAttendanceStatus[]
) {
	return db
		.select({
			attendeeId: attendeeIdentities.id,
			name: attendeeIdentities.name,
			email: attendeeIdentities.email,
			userId: attendeeIdentities.userId
		})
		.from(sessionParticipants)
		.innerJoin(attendeeIdentities, eq(sessionParticipants.attendeeId, attendeeIdentities.id))
		.where(
			and(
				eq(sessionParticipants.sessionId, sessionId),
				inArray(sessionParticipants.attendanceStatus, statuses),
				isNotNull(attendeeIdentities.email)
			)
		)
		.orderBy(asc(attendeeIdentities.name))
		.all();
}

/**
 * People who attended an earlier session (or hold a confirmed place at one) and have no
 * record of any kind for this session yet.
 */
async function selectPastAttendeeRecipients(db: ORM, session: StoriedSession) {
	return db
		.select({
			attendeeId: attendeeIdentities.id,
			name: attendeeIdentities.name,
			email: attendeeIdentities.email,
			userId: attendeeIdentities.userId
		})
		.from(attendeeIdentities)
		.where(
			and(
				isNotNull(attendeeIdentities.email),
				sql`EXISTS (
					SELECT 1 FROM ${sessionParticipants} earlier
					INNER JOIN ${sessions} earlier_session ON earlier_session.id = earlier.session_id
					WHERE earlier.attendee_id = ${attendeeIdentities.id}
						AND earlier.session_id <> ${session.id}
						AND earlier.attendance_status IN ('attended', 'attending')
						AND earlier_session.status IN ('past', 'current', 'scheduled')
						AND (
							earlier_session.status = 'past'
							OR (earlier_session.starts_at IS NOT NULL AND earlier_session.starts_at < ${session.startsAt ?? '9999'})
						)
				)`,
				sql`NOT EXISTS (
					SELECT 1 FROM ${sessionParticipants} current
					WHERE current.attendee_id = ${attendeeIdentities.id}
						AND current.session_id = ${session.id}
				)`
			)
		)
		.orderBy(asc(attendeeIdentities.name))
		.all();
}

/**
 * Resolve the deduplicated recipient list for a set of audiences. A person who fits more
 * than one audience is counted once, under the first matching audience in priority order.
 */
export async function resolveSessionMessageRecipients(
	db: ORM,
	session: StoriedSession,
	audiences: SessionMessageAudience[]
) {
	const selected = new Set(audiences);
	const byAudience = {} as Record<SessionMessageAudience, SessionMessageRecipient[]>;
	const seen = new Set<string>();
	const recipients: SessionMessageRecipient[] = [];

	for (const audience of SESSION_MESSAGE_AUDIENCES) {
		byAudience[audience] = [];
		const statuses = audienceStatuses[audience];
		const rows = statuses
			? await selectStatusRecipients(db, session.id, statuses)
			: await selectPastAttendeeRecipients(db, session);
		for (const row of rows) {
			const email = row.email?.trim();
			if (!email || !emailPattern.test(email)) continue;
			const recipient: SessionMessageRecipient = {
				attendeeId: row.attendeeId,
				name: row.name,
				email,
				userId: row.userId,
				audience
			};
			byAudience[audience].push(recipient);
			if (!selected.has(audience) || seen.has(row.attendeeId)) continue;
			seen.add(row.attendeeId);
			recipients.push(recipient);
		}
	}

	return { recipients, byAudience };
}

function renderMessageEmail(
	session: StoriedSession,
	message: Pick<SessionMessage, 'subject' | 'bodySource' | 'bodyHtml'>,
	recipient: SessionMessageRecipient
) {
	const reason = SESSION_MESSAGE_AUDIENCE_LABELS[recipient.audience].reason;
	const url = sessionPublicUrl(session, recipient);
	const when = formatSessionDate(session);
	const locationText = session.locationName ? `\nLocation: ${session.locationName}` : '';
	const locationHtml = session.locationName
		? `<p style="margin:4px 0"><strong>Location:</strong> ${escapeHtml(session.locationName)}</p>`
		: '';

	return {
		subject: message.subject,
		textBody: `Hi ${recipient.name},\n\n${message.bodySource}\n\n${session.title}\nWhen: ${when}${locationText}\nView session details: ${url}\n\nYou are receiving this because ${reason}.`,
		htmlBody: emailWrapper(
			`<p>Hi ${escapeHtml(recipient.name)},</p>${message.bodyHtml}<div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0"><h3 style="margin:0 0 8px;color:#6d28d9">${escapeHtml(session.title)}</h3><p style="margin:4px 0"><strong>When:</strong> ${escapeHtml(when)}</p>${locationHtml}<p style="margin:12px 0 0"><a href="${escapeHtml(url)}">View session details</a></p></div><p style="color:#6b7280;font-size:13px">You are receiving this because ${escapeHtml(reason)}.</p>`
		)
	};
}

async function deliverOne(
	platform: App.Platform | undefined,
	email: { subject: string; textBody: string; htmlBody: string },
	to: string
) {
	if (!platform) return { success: true as const };
	return sendEmail(platform, { to, ...email });
}

async function attemptDelivery(args: {
	db: ORM;
	platform: App.Platform | undefined;
	session: StoriedSession;
	message: SessionMessage;
	delivery: typeof sessionMessageDeliveries.$inferSelect;
}) {
	const { db, platform, session, message, delivery } = args;
	const recipient: SessionMessageRecipient = {
		attendeeId: delivery.attendeeId,
		name: delivery.recipientName,
		email: delivery.recipientEmail,
		userId: null,
		audience: delivery.audience as SessionMessageAudience
	};
	const attendee = await db
		.select({ userId: attendeeIdentities.userId })
		.from(attendeeIdentities)
		.where(eq(attendeeIdentities.id, delivery.attendeeId))
		.get();
	recipient.userId = attendee?.userId ?? null;

	const now = new Date().toISOString();
	const result = await deliverOne(
		platform,
		renderMessageEmail(session, message, recipient),
		delivery.recipientEmail
	);
	await db
		.update(sessionMessageDeliveries)
		.set({
			status: result.success ? 'sent' : 'failed',
			failureReason: result.success
				? null
				: ('error' in result && result.error) || 'Unknown email error',
			attemptCount: delivery.attemptCount + 1,
			attemptedAt: now,
			sentAt: result.success ? now : delivery.sentAt,
			updatedAt: now
		})
		.where(eq(sessionMessageDeliveries.id, delivery.id));
	return result.success;
}

async function refreshMessageCounts(db: ORM, messageId: string) {
	const counts = await db
		.select({
			sent: sql<number>`SUM(CASE WHEN ${sessionMessageDeliveries.status} = 'sent' THEN 1 ELSE 0 END)`,
			failed: sql<number>`SUM(CASE WHEN ${sessionMessageDeliveries.status} = 'failed' THEN 1 ELSE 0 END)`,
			total: sql<number>`COUNT(*)`
		})
		.from(sessionMessageDeliveries)
		.where(eq(sessionMessageDeliveries.messageId, messageId))
		.get();
	const sentCount = Number(counts?.sent ?? 0);
	const failedCount = Number(counts?.failed ?? 0);
	await db
		.update(sessionMessages)
		.set({
			sentCount,
			failedCount,
			recipientCount: Number(counts?.total ?? 0),
			updatedAt: new Date().toISOString()
		})
		.where(eq(sessionMessages.id, messageId));
	return { sentCount, failedCount };
}

export type SendSessionMessageResult =
	| { error: string }
	| { messageId: string; recipientCount: number; sentCount: number; failedCount: number };

/**
 * Record a message, reserve one delivery per recipient, then send each email. Every
 * delivery keeps its own status so a partial failure can be retried later.
 */
export async function sendSessionMessage(args: {
	db: ORM;
	platform: App.Platform | undefined;
	session: StoriedSession;
	senderUserId: string | null;
	kind: SessionMessageKind;
	audiences: SessionMessageAudience[];
	subject: string;
	bodySource: string;
}): Promise<SendSessionMessageResult> {
	const { db, platform, session } = args;
	const subject = args.subject.trim();
	const bodySource = args.bodySource.trim();
	if (args.audiences.length === 0) return { error: 'Choose at least one audience.' };
	if (!subject) return { error: 'Enter a subject.' };
	if (!bodySource) return { error: 'Enter a message.' };

	const { recipients } = await resolveSessionMessageRecipients(db, session, args.audiences);
	if (recipients.length === 0) {
		return { error: 'Nobody in the chosen audiences has an email address.' };
	}

	const now = new Date().toISOString();
	const messageId = newId();
	const message = await db
		.insert(sessionMessages)
		.values({
			id: messageId,
			sessionId: session.id,
			senderUserId: args.senderUserId,
			kind: args.kind,
			audiences: args.audiences.join(','),
			subject,
			bodySource,
			bodyHtml: renderMarkdown(bodySource),
			recipientCount: recipients.length,
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();

	const deliveries = await db
		.insert(sessionMessageDeliveries)
		.values(
			recipients.map((recipient) => ({
				id: newId(),
				messageId,
				sessionId: session.id,
				attendeeId: recipient.attendeeId,
				recipientName: recipient.name,
				recipientEmail: recipient.email,
				audience: recipient.audience,
				createdAt: now,
				updatedAt: now
			}))
		)
		.returning()
		.all();

	for (const delivery of deliveries) {
		try {
			await attemptDelivery({ db, platform, session, message, delivery });
		} catch (error) {
			console.error(`[SESSION MESSAGE] Delivery ${delivery.id} threw:`, error);
			await db
				.update(sessionMessageDeliveries)
				.set({
					status: 'failed',
					failureReason: error instanceof Error ? error.message : 'Unknown email error',
					attemptCount: delivery.attemptCount + 1,
					attemptedAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				})
				.where(eq(sessionMessageDeliveries.id, delivery.id));
		}
	}

	const counts = await refreshMessageCounts(db, messageId);
	return { messageId, recipientCount: recipients.length, ...counts };
}

/** Re-send every failed delivery for a message. Sent deliveries are left alone. */
export async function retrySessionMessage(args: {
	db: ORM;
	platform: App.Platform | undefined;
	session: StoriedSession;
	messageId: string;
}) {
	const { db, platform, session, messageId } = args;
	const message = await db
		.select()
		.from(sessionMessages)
		.where(and(eq(sessionMessages.id, messageId), eq(sessionMessages.sessionId, session.id)))
		.get();
	if (!message) return null;

	const failed = await db
		.select()
		.from(sessionMessageDeliveries)
		.where(
			and(
				eq(sessionMessageDeliveries.messageId, messageId),
				inArray(sessionMessageDeliveries.status, ['failed', 'sending'])
			)
		)
		.all();

	let retried = 0;
	for (const delivery of failed) {
		retried += (await attemptDelivery({ db, platform, session, message, delivery })) ? 1 : 0;
	}
	const counts = await refreshMessageCounts(db, messageId);
	return { attempted: failed.length, retried, ...counts };
}

export async function listSessionMessages(db: ORM, sessionId: string) {
	return db
		.select({
			message: sessionMessages,
			sender: { id: users.id, displayName: users.displayName }
		})
		.from(sessionMessages)
		.leftJoin(users, eq(sessionMessages.senderUserId, users.id))
		.where(eq(sessionMessages.sessionId, sessionId))
		.orderBy(desc(sessionMessages.createdAt))
		.all();
}

export async function listSessionMessageDeliveries(db: ORM, sessionId: string) {
	return db
		.select()
		.from(sessionMessageDeliveries)
		.where(eq(sessionMessageDeliveries.sessionId, sessionId))
		.orderBy(asc(sessionMessageDeliveries.recipientName))
		.all();
}

/** Latest reminder delivery per attendee for the attendee screen. */
export async function listReminderDeliveriesByAttendee(db: ORM, sessionId: string) {
	const rows = await db
		.select()
		.from(sessionReminderDeliveries)
		.where(eq(sessionReminderDeliveries.sessionId, sessionId))
		.all();
	return Object.fromEntries(rows.map((row) => [row.attendeeId, row]));
}

/** Prefill the composer from a `template` query parameter set by the session editor. */
export function draftFromTemplate(
	session: StoriedSession,
	params: URLSearchParams
): { kind: SessionMessageKind; draft: SessionMessageDraft; audiences: SessionMessageAudience[] } {
	const template = params.get('template');
	if (template === 'cancelled') {
		return {
			kind: 'cancellation',
			draft: buildSessionCancellationMessage(session),
			audiences: ['attending', 'waitlisted', 'maybe']
		};
	}
	if (template === 'update') {
		const previous = {
			title: session.title,
			startsAt: params.get('prevStartsAt') ?? session.startsAt,
			timezone: params.get('prevTimezone') ?? session.timezone,
			locationName: params.has('prevLocation') ? params.get('prevLocation') : session.locationName
		};
		return {
			kind: 'update',
			draft: buildSessionUpdateMessage(session, detectSessionDetailChanges(previous, session)),
			audiences: ['attending', 'waitlisted', 'maybe']
		};
	}
	return { kind: 'custom', draft: { subject: '', body: '' }, audiences: ['attending'] };
}
