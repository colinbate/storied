import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { ORM } from './db';
import { attendeeIdentities, sessionParticipants, sessions, users } from './db/schema';
import { isFutureSession } from '$shared/session-lifecycle';
import { sendWaitlistPromotionEmail } from './rsvp-email';

export async function canLeaveClub(db: ORM, userId: string) {
	const member = await db.select().from(users).where(eq(users.id, userId)).get();
	if (!member || member.status !== 'active') return false;
	if (member.role !== 'admin') return true;
	const admins = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.status, 'active'), eq(users.role, 'admin')))
		.all();
	return admins.some((admin) => admin.id !== userId);
}

export async function leaveClub(db: ORM, userId: string, now = new Date()) {
	for (let attempt = 0; attempt < 3; attempt++) {
		const result = await attemptDeparture(db, userId, now);
		if (result.left || !(await canLeaveClub(db, userId))) {
			return { ...result, registrationsChanged: false };
		}
	}
	return { left: false as const, promotedIds: [], registrationsChanged: true };
}

/** The unique audit ID fences every write in the atomic departure batch. */
async function attemptDeparture(db: ORM, userId: string, now: Date) {
	const registrations = await db
		.select({ participant: sessionParticipants, session: sessions })
		.from(sessionParticipants)
		.innerJoin(attendeeIdentities, eq(sessionParticipants.attendeeId, attendeeIdentities.id))
		.innerJoin(sessions, eq(sessionParticipants.sessionId, sessions.id))
		.where(
			and(
				eq(attendeeIdentities.userId, userId),
				inArray(sessionParticipants.attendanceStatus, ['attending', 'waitlisted', 'maybe'])
			)
		)
		.all();
	const upcoming = registrations.filter(
		({ session }) =>
			isFutureSession(session, now) &&
			session.status !== 'past' &&
			!session.liveStartedAt &&
			!session.liveEndedAt
	);
	const stamp = now.toISOString();
	const operationId = crypto.randomUUID();
	const client = db.$client;
	const guard = 'EXISTS (SELECT 1 FROM moderation_events WHERE id = ?)';
	// Retry before making any changes if an RSVP or schedule changed during the read.
	// JSON keeps the snapshot within D1's bound-parameter limit for large RSVP lists.
	const snapshot = JSON.stringify(
		registrations.map(({ participant, session }) => [
			participant.id,
			session.id,
			participant.attendanceStatus,
			session.startsAt,
			session.timezone,
			session.status,
			session.liveStartedAt,
			session.liveEndedAt
		])
	);
	const registrationRows = `FROM session_participants p
	 JOIN attendee_identities a ON a.id = p.attendee_id JOIN sessions s ON s.id = p.session_id
	 WHERE a.user_id = ? AND p.attendance_status IN ('attending', 'waitlisted', 'maybe')`;
	const statements = [
		client
			.prepare(
				`INSERT INTO moderation_events (id, actor_user_id, target_type, target_id, action, created_at)
		 SELECT ?, id, 'user', id, 'leave_club', ? FROM users u WHERE id = ? AND status = 'active'
		 AND (role <> 'admin' OR EXISTS (SELECT 1 FROM users other WHERE other.id <> u.id AND other.role = 'admin' AND other.status = 'active'))
		 AND (SELECT COUNT(*) ${registrationRows}) = ?
		 AND NOT EXISTS (SELECT 1 ${registrationRows}
		 AND json_array(p.id, s.id, p.attendance_status, s.starts_at, s.timezone, s.status, s.live_started_at, s.live_ended_at)
		 NOT IN (SELECT value FROM json_each(?)))`
			)
			.bind(operationId, stamp, userId, userId, registrations.length, userId, snapshot),
		client
			.prepare(
				`UPDATE users SET status = 'suspended', role = 'member', left_at = ?, updated_at = ? WHERE id = ? AND ${guard}`
			)
			.bind(stamp, stamp, userId, operationId),
		client
			.prepare(`DELETE FROM user_sessions WHERE user_id = ? AND ${guard}`)
			.bind(userId, operationId),
		client
			.prepare(
				`DELETE FROM auth_magic_links WHERE (user_id = ? OR email = (SELECT email FROM users WHERE id = ?)) AND ${guard}`
			)
			.bind(userId, userId, operationId),
		client
			.prepare(
				`DELETE FROM signup_tickets WHERE email = (SELECT email FROM users WHERE id = ?) AND ${guard}`
			)
			.bind(userId, operationId),
		client
			.prepare(
				`INSERT INTO notification_preferences (user_id, email_enabled, marketing_enabled, pushover_enabled, auto_subscribe_own, auto_subscribe_session_threads, updated_at)
		 SELECT ?, 0, 0, 0, 0, 0, ? WHERE ${guard}
		 ON CONFLICT(user_id) DO UPDATE SET email_enabled = 0, marketing_enabled = 0, pushover_enabled = 0, digest_hour_local = NULL, auto_subscribe_own = 0, auto_subscribe_session_threads = 0, updated_at = excluded.updated_at`
			)
			.bind(userId, stamp, operationId),
		client
			.prepare(
				`UPDATE notification_events SET status = 'cancelled', available_at = NULL, updated_at = ? WHERE user_id = ? AND status IN ('pending', 'failed') AND ${guard}`
			)
			.bind(stamp, userId, operationId),
		client
			.prepare(`DELETE FROM subscriptions WHERE user_id = ? AND ${guard}`)
			.bind(userId, operationId),
		client
			.prepare(`DELETE FROM group_memberships WHERE user_id = ? AND ${guard}`)
			.bind(userId, operationId)
	];
	const promotionIndexes: number[] = [];
	for (const { participant, session } of upcoming) {
		// The audit insert verified this schedule snapshot inside the same transaction.
		const meetingGuard = `EXISTS (SELECT 1 FROM sessions s WHERE s.id = ? AND s.starts_at = ? AND s.timezone = ? AND s.status <> 'past' AND s.live_started_at IS NULL AND s.live_ended_at IS NULL)`;
		statements.push(
			client
				.prepare(
					`UPDATE session_participants SET attendance_status = 'cancelled', updated_at = ?
		 WHERE id = ? AND attendee_id IN (SELECT id FROM attendee_identities WHERE user_id = ?)
		 AND attendance_status IN ('attending', 'waitlisted', 'maybe') AND ${guard} AND ${meetingGuard}`
				)
				.bind(
					stamp,
					participant.id,
					userId,
					operationId,
					session.id,
					session.startsAt,
					session.timezone
				)
		);
		if (participant.attendanceStatus !== 'attending') continue;
		promotionIndexes.push(statements.length);
		statements.push(
			client
				.prepare(
					`UPDATE session_participants SET attendance_status = 'attending', updated_at = ?
		 WHERE id = (SELECT p.id FROM session_participants p
		 JOIN attendee_identities a ON a.id = p.attendee_id LEFT JOIN users u ON u.id = a.user_id
		 WHERE p.session_id = ? AND p.attendance_status = 'waitlisted' AND (a.user_id IS NULL OR u.status = 'active')
		 ORDER BY p.created_at, p.id LIMIT 1)
		 AND ${guard} AND ${meetingGuard}
		 AND EXISTS (SELECT 1 FROM session_participants WHERE id = ? AND attendance_status = 'cancelled' AND updated_at = ?)
		 AND EXISTS (SELECT 1 FROM sessions s WHERE s.id = ? AND s.rsvp_enabled = 1 AND s.status IN ('current', 'scheduled')
		 AND (SELECT COUNT(*) FROM session_participants WHERE session_id = s.id AND attendance_status = 'attending') < s.rsvp_capacity)
		 RETURNING id`
				)
				.bind(
					stamp,
					session.id,
					operationId,
					session.id,
					session.startsAt,
					session.timezone,
					participant.id,
					stamp,
					session.id
				)
		);
	}
	const results = await client.batch<{ id: string }>(statements);
	if (results[0].meta.changes !== 1) return { left: false as const, promotedIds: [] };
	return {
		left: true as const,
		promotedIds: promotionIndexes.flatMap((index) =>
			results[index].results.map((row) => String(row.id))
		)
	};
}

export async function notifyDeparturePromotions(
	db: ORM,
	ids: string[],
	platform: App.Platform | undefined,
	baseUrl: string
) {
	for (const id of ids) {
		try {
			const row = await db
				.select({
					participant: sessionParticipants,
					attendee: attendeeIdentities,
					session: sessions
				})
				.from(sessionParticipants)
				.innerJoin(attendeeIdentities, eq(sessionParticipants.attendeeId, attendeeIdentities.id))
				.innerJoin(sessions, eq(sessionParticipants.sessionId, sessions.id))
				.leftJoin(users, eq(attendeeIdentities.userId, users.id))
				.where(
					and(
						eq(sessionParticipants.id, id),
						eq(sessionParticipants.attendanceStatus, 'attending'),
						or(isNull(attendeeIdentities.userId), eq(users.status, 'active'))
					)
				)
				.get();
			if (!row) continue;
			await sendWaitlistPromotionEmail(
				platform,
				row.session,
				row.participant,
				row.attendee,
				baseUrl,
				db
			);
		} catch (error) {
			console.error('Departure waitlist promotion email failed', error);
		}
	}
}
