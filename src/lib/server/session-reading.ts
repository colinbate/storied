import { and, eq } from 'drizzle-orm';
import type { ORM } from '$lib/server/db';
import { sessionReadingChoices, type SessionReadingStatus } from '$lib/server/db/schema';

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
	await db
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
