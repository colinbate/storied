import type {
	SubjectType,
	SubjectSessionLink,
	SubjectSeriesBookLink
} from '$shared/worker-messages';
import { generateId } from '../shared/ids';

export async function linkThreadSubject(
	db: D1Database,
	subjectType: SubjectType,
	subjectId: string,
	threadId?: string,
	postId?: string
): Promise<void> {
	if (!threadId) return;

	await db
		.prepare(
			`INSERT OR IGNORE INTO thread_subjects (id, thread_id, post_id, subject_type, subject_id, display_order, context, created_at)
				VALUES (?, ?, ?, ?, ?, 0, 'linked', ?)`
		)
		.bind(generateId(), threadId, postId ?? null, subjectType, subjectId, new Date().toISOString())
		.run();
}

export async function linkSessionSubject(
	db: D1Database,
	subjectType: SubjectType,
	subjectId: string,
	sessionLink?: SubjectSessionLink
): Promise<void> {
	if (!sessionLink) return;

	const now = new Date().toISOString();
	await db
		.prepare(
			`INSERT OR IGNORE INTO session_subjects (session_id, subject_type, subject_id, status, note, added_by_user_id, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			sessionLink.sessionId,
			subjectType,
			subjectId,
			sessionLink.status,
			sessionLink.note ?? null,
			sessionLink.addedByUserId ?? null,
			now,
			now
		)
		.run();
}

export async function linkSeriesBook(
	db: D1Database,
	resolvedKind: SubjectType,
	resolvedId: string,
	seriesBookLink?: SubjectSeriesBookLink
): Promise<void> {
	if (!seriesBookLink) return;

	let seriesId: string | undefined;
	let bookId: string | undefined;
	if (resolvedKind === 'book') {
		seriesId = seriesBookLink.seriesId;
		bookId = resolvedId;
	} else if (resolvedKind === 'series') {
		seriesId = resolvedId;
		bookId = seriesBookLink.bookId;
	}
	if (!seriesId || !bookId) return;

	await db
		.prepare(
			`INSERT OR IGNORE INTO series_books (series_id, book_id, position, position_sort, linked_at)
				VALUES (?, ?, ?, ?, ?)`
		)
		.bind(
			seriesId,
			bookId,
			seriesBookLink.position ?? null,
			seriesBookLink.positionSort ?? null,
			new Date().toISOString()
		)
		.run();
}

export async function markSourceFailed(db: D1Database, subjectSourceId: string): Promise<void> {
	const now = new Date().toISOString();
	await db
		.prepare(
			`UPDATE subject_sources SET fetch_status = 'failed', last_fetched_at = ?, updated_at = ? WHERE id = ?`
		)
		.bind(now, now, subjectSourceId)
		.run();
}
