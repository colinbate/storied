import { sessionStartInstant, DEFAULT_SESSION_TIMEZONE } from './session-reminder-timezone';
import {
	renderSessionReminderEmail,
	type ReminderSession,
	type ReminderRecipient
} from './session-reminder-email';

export const REMINDER_LEASE_MS = 10 * 60_000;

type ReminderDatabase = Pick<D1Database, 'prepare' | 'batch'>;
type CurrentSession = ReminderSession & {
	status: string;
	reminder_revision: number;
	live_started_at: string | null;
	live_ended_at: string | null;
};
type CurrentRecipient = ReminderRecipient & { member_status: string | null };
type SendReminder = (email: {
	to: string;
	subject: string;
	textBody: string;
	htmlBody: string;
}) => Promise<{ success: boolean; error?: string }>;

export function reminderSessionEligible(
	session: {
		startsAt: string | null;
		timezone?: string | null;
		status: string;
		liveStartedAt?: string | null;
		liveEndedAt?: string | null;
	},
	now = new Date()
) {
	const start = session.startsAt
		? sessionStartInstant(session.startsAt, session.timezone ?? DEFAULT_SESSION_TIMEZONE)
		: null;
	return (
		(session.status === 'current' || session.status === 'scheduled') &&
		!session.liveStartedAt &&
		!session.liveEndedAt &&
		!!start &&
		start > now
	);
}

export function retryableReminder(
	delivery: { status: string; leaseExpiresAt: string | null; attemptedAt: string },
	now = new Date()
) {
	const expires = delivery.leaseExpiresAt
		? new Date(delivery.leaseExpiresAt).getTime()
		: new Date(delivery.attemptedAt).getTime() + REMINDER_LEASE_MS;
	return (
		delivery.status === 'failed' || (delivery.status === 'sending' && expires <= now.getTime())
	);
}

async function candidate(db: ReminderDatabase, sessionId: string, attendeeId: string, now: Date) {
	const session = await db
		.prepare(
			`SELECT id, slug, title, starts_at, timezone, location_name, astro_path, is_public, status, reminder_revision, live_started_at, live_ended_at FROM sessions WHERE id = ?`
		)
		.bind(sessionId)
		.first<CurrentSession>();
	if (
		!session ||
		!reminderSessionEligible(
			{
				startsAt: session.starts_at,
				timezone: session.timezone,
				status: session.status,
				liveStartedAt: session.live_started_at,
				liveEndedAt: session.live_ended_at
			},
			now
		)
	)
		return null;
	const recipient = await db
		.prepare(
			`SELECT participant.id AS participant_id, attendee.id AS attendee_id,
		attendee.name AS attendee_name, attendee.email, attendee.user_id, participant.confirmation_token,
		member.timezone, member.status AS member_status
		FROM session_participants participant
		INNER JOIN attendee_identities attendee ON attendee.id = participant.attendee_id
		LEFT JOIN users member ON member.id = attendee.user_id
		WHERE participant.session_id = ? AND attendee.id = ? AND participant.attendance_status = 'attending'`
		)
		.bind(sessionId, attendeeId)
		.first<CurrentRecipient>();
	if (
		!recipient ||
		!recipient.email ||
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email.trim()) ||
		(recipient.user_id && recipient.member_status !== 'active')
	)
		return null;
	return { session, recipient };
}

/** Atomic claim plus append-only attempt history. Successful revisions cannot be reclaimed. */
export async function deliverSessionReminder(
	db: ReminderDatabase,
	sessionId: string,
	attendeeId: string,
	send: SendReminder,
	options: { now?: Date; retryDeliveryId?: string; requestedByUserId?: string | null } = {}
): Promise<'sent' | 'failed' | 'skipped'> {
	const now = options.now ?? new Date();
	const current = await candidate(db, sessionId, attendeeId, now);
	if (!current) return 'skipped';
	const { session, recipient } = current;
	const stamp = now.toISOString();
	const lease = new Date(now.getTime() + REMINDER_LEASE_MS).toISOString();
	const attemptId = crypto.randomUUID();
	const deliveryId = crypto.randomUUID();
	const source = options.retryDeliveryId ? 'facilitator' : 'scheduled';
	const retryId = options.retryDeliveryId ?? null;
	const result = await db.batch([
		db
			.prepare(
				`INSERT INTO session_reminder_deliveries
			(id, session_id, attendee_id, participant_id, recipient_email, schedule_revision,
			 schedule_starts_at, schedule_timezone, status, active_attempt_id, lease_expires_at,
			 attempt_count, attempted_at, created_at, updated_at)
			SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'sending', ?, ?, 1, ?, ?, ?
			WHERE EXISTS (
				SELECT 1 FROM sessions s JOIN session_participants p ON p.session_id = s.id
				JOIN attendee_identities a ON a.id = p.attendee_id LEFT JOIN users u ON u.id = a.user_id
				WHERE s.id = ? AND s.reminder_revision = ? AND s.starts_at = ? AND s.timezone = ?
				AND s.status IN ('current', 'scheduled') AND s.live_started_at IS NULL AND s.live_ended_at IS NULL
				AND p.id = ? AND p.attendance_status = 'attending' AND a.email = ?
				AND (a.user_id IS NULL OR u.status = 'active')
			) AND (? IS NULL OR EXISTS (
				SELECT 1 FROM session_reminder_deliveries d WHERE d.id = ? AND d.session_id = ?
				AND d.attendee_id = ? AND d.schedule_revision = ?
				AND (d.status = 'failed' OR (d.status = 'sending' AND COALESCE(d.lease_expires_at, strftime('%Y-%m-%dT%H:%M:%fZ', d.attempted_at, '+10 minutes')) <= ?))
			))
			ON CONFLICT(session_id, attendee_id, schedule_revision) DO UPDATE SET
			status = 'sending', participant_id = excluded.participant_id, recipient_email = excluded.recipient_email,
			active_attempt_id = excluded.active_attempt_id, lease_expires_at = excluded.lease_expires_at,
			attempt_count = session_reminder_deliveries.attempt_count + 1, failure_reason = NULL,
			attempted_at = excluded.attempted_at, updated_at = excluded.updated_at
			WHERE session_reminder_deliveries.status = 'failed' OR
			(session_reminder_deliveries.status = 'sending' AND COALESCE(session_reminder_deliveries.lease_expires_at,
			strftime('%Y-%m-%dT%H:%M:%fZ', session_reminder_deliveries.attempted_at, '+10 minutes')) <= ?)`
			)
			.bind(
				deliveryId,
				sessionId,
				attendeeId,
				recipient.participant_id,
				recipient.email,
				session.reminder_revision,
				session.starts_at,
				session.timezone,
				attemptId,
				lease,
				stamp,
				stamp,
				stamp,
				sessionId,
				session.reminder_revision,
				session.starts_at,
				session.timezone,
				recipient.participant_id,
				recipient.email,
				retryId,
				retryId,
				sessionId,
				attendeeId,
				session.reminder_revision,
				stamp,
				stamp
			),
		db
			.prepare(
				`UPDATE session_reminder_attempts SET status = 'expired',
			failure_reason = 'Delivery lease expired before completion', completed_at = ?
			WHERE status = 'sending' AND id <> ? AND delivery_id IN
			(SELECT id FROM session_reminder_deliveries WHERE active_attempt_id = ?)`
			)
			.bind(stamp, attemptId, attemptId),
		db
			.prepare(
				`INSERT INTO session_reminder_attempts
			(id, delivery_id, recipient_email, source, requested_by_user_id, attempted_at)
			SELECT ?, id, recipient_email, ?, ?, ? FROM session_reminder_deliveries
			WHERE active_attempt_id = ? AND status = 'sending'`
			)
			.bind(attemptId, source, options.requestedByUserId ?? null, stamp, attemptId)
	]);
	if (result[2].meta.changes !== 1) return 'skipped';

	let outcome: 'sent' | 'failed' | 'skipped' = 'failed';
	let reason: string | null = null;
	try {
		const latest = await candidate(db, sessionId, attendeeId, options.now ?? new Date());
		if (
			!latest ||
			latest.session.reminder_revision !== session.reminder_revision ||
			latest.recipient.email !== recipient.email ||
			latest.recipient.participant_id !== recipient.participant_id
		) {
			outcome = 'skipped';
			reason = 'Meeting or RSVP changed before delivery';
		} else if (
			!(await db
				.prepare(
					`SELECT id FROM session_reminder_deliveries
					WHERE active_attempt_id = ? AND status = 'sending' AND lease_expires_at > ?`
				)
				.bind(attemptId, (options.now ?? new Date()).toISOString())
				.first())
		) {
			outcome = 'skipped';
			reason = 'Delivery reservation expired or was replaced before sending';
		} else {
			const email = await send({
				to: latest.recipient.email,
				...renderSessionReminderEmail(latest.session, latest.recipient, now)
			});
			outcome = email.success ? 'sent' : 'failed';
			reason = email.success ? null : (email.error ?? 'Unknown email error');
		}
	} catch (error) {
		reason = error instanceof Error ? error.message : 'Unknown email error';
	}
	const completed = (options.now ?? new Date()).toISOString();
	// The token fences late callbacks from an expired attempt. A crash after provider acceptance
	// but before this write is inherently ambiguous; reclaiming that lease may repeat an email.
	await db.batch([
		db
			.prepare(
				`UPDATE session_reminder_deliveries SET status = ?, failure_reason = ?, sent_at = ?,
			lease_expires_at = NULL, updated_at = ? WHERE active_attempt_id = ? AND status = 'sending'`
			)
			.bind(
				outcome === 'sent' ? 'sent' : 'failed',
				reason,
				outcome === 'sent' ? completed : null,
				completed,
				attemptId
			),
		db
			.prepare(
				`UPDATE session_reminder_attempts SET status = ?, failure_reason = ?, completed_at = ?
			WHERE id = ? AND status = 'sending'`
			)
			.bind(outcome, reason, completed, attemptId)
	]);
	return outcome;
}
