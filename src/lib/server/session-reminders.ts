import { and, desc, eq } from 'drizzle-orm';
import type { ORM } from './db';
import { sessionReminderAttempts, sessionReminderDeliveries } from './db/schema';

export async function reminderAttemptHistory(db: ORM, sessionId: string) {
	const rows = await db
		.select({
			attempt: sessionReminderAttempts,
			attendeeId: sessionReminderDeliveries.attendeeId,
			scheduleRevision: sessionReminderDeliveries.scheduleRevision,
			startsAt: sessionReminderDeliveries.scheduleStartsAt,
			timezone: sessionReminderDeliveries.scheduleTimezone
		})
		.from(sessionReminderAttempts)
		.innerJoin(
			sessionReminderDeliveries,
			eq(sessionReminderAttempts.deliveryId, sessionReminderDeliveries.id)
		)
		.where(eq(sessionReminderDeliveries.sessionId, sessionId))
		.orderBy(desc(sessionReminderAttempts.attemptedAt), desc(sessionReminderAttempts.id))
		.all();
	const history: Record<string, typeof rows> = {};
	for (const row of rows) (history[row.attendeeId] ??= []).push(row);
	return history;
}

export async function reminderForSession(db: ORM, sessionId: string, deliveryId: string) {
	return db
		.select()
		.from(sessionReminderDeliveries)
		.where(
			and(
				eq(sessionReminderDeliveries.sessionId, sessionId),
				eq(sessionReminderDeliveries.id, deliveryId)
			)
		)
		.get();
}
