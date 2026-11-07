import { and, eq } from 'drizzle-orm';
import type { ORM } from '$lib/server/db';
import {
	attendeeIdentities,
	sessionReadingChoices,
	userSubjects,
	type SessionReadingStatus
} from '$lib/server/db/schema';
import { BOOK_READING_STATUS } from '$shared/session-reading';

export const SESSION_READING_STATUSES = [
	'considering',
	'planned',
	'reading',
	'finished',
	'did_not_finish'
] as const satisfies readonly SessionReadingStatus[];

export function isSessionReadingStatus(value: unknown): value is SessionReadingStatus {
	return (
		typeof value === 'string' && SESSION_READING_STATUSES.includes(value as SessionReadingStatus)
	);
}

export async function upsertSessionReadingChoice(
	db: ORM,
	choice: {
		sessionId: string;
		attendeeId: string;
		bookId: string;
		readingStatus: SessionReadingStatus;
	}
) {
	const now = new Date().toISOString();
	const saveChoice = db
		.insert(sessionReadingChoices)
		.values(choice)
		.onConflictDoUpdate({
			target: [
				sessionReadingChoices.sessionId,
				sessionReadingChoices.attendeeId,
				sessionReadingChoices.bookId
			],
			set: {
				readingStatus: choice.readingStatus,
				updatedAt: now
			}
		});
	const attendee = await db
		.select({ userId: attendeeIdentities.userId })
		.from(attendeeIdentities)
		.where(eq(attendeeIdentities.id, choice.attendeeId))
		.get();
	if (!attendee?.userId) {
		await saveChoice;
		return;
	}

	const readingStatus = BOOK_READING_STATUS[choice.readingStatus];
	await db.batch([
		saveChoice,
		db
			.insert(userSubjects)
			.values({
				userId: attendee.userId,
				subjectType: 'book',
				subjectId: choice.bookId,
				readingStatus,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: [userSubjects.userId, userSubjects.subjectType, userSubjects.subjectId],
				set: { readingStatus, updatedAt: now }
			})
	]);
}

export async function removeSessionReadingChoice(
	db: ORM,
	choice: {
		sessionId: string;
		attendeeId: string;
		bookId: string;
	}
) {
	await db
		.delete(sessionReadingChoices)
		.where(
			and(
				eq(sessionReadingChoices.sessionId, choice.sessionId),
				eq(sessionReadingChoices.attendeeId, choice.attendeeId),
				eq(sessionReadingChoices.bookId, choice.bookId)
			)
		);
}
