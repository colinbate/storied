import type {
	SubjectType,
	SubjectSessionLink,
	SubjectSeriesBookLink,
	SubjectUserFeatureLink
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

export async function linkUserFeaturedSubject(
	db: D1Database,
	subjectType: SubjectType,
	subjectId: string,
	userFeatureLink?: SubjectUserFeatureLink
): Promise<void> {
	if (!userFeatureLink) return;

	const existingFeatured = await db
		.prepare(
			`SELECT subject_type, subject_id, featured_order
			 FROM user_subjects
			 WHERE user_id = ? AND featured_on_profile = 1`
		)
		.bind(userFeatureLink.userId)
		.all<{
			subject_type: SubjectType;
			subject_id: string;
			featured_order: number | null;
		}>();

	const featuredRows = existingFeatured.results ?? [];
	const alreadyFeatured = featuredRows.some(
		(row) => row.subject_type === subjectType && row.subject_id === subjectId
	);
	if (!alreadyFeatured && featuredRows.length >= 5) return;

	const featuredOrder =
		userFeatureLink.featuredOrder ??
		featuredRows.reduce((max, row) => Math.max(max, row.featured_order ?? 0), 0) + 1;
	const now = new Date().toISOString();

	await db
		.prepare(
			`INSERT INTO user_subjects
				(user_id, subject_type, subject_id, reading_status, is_recommended, featured_on_profile, featured_order, created_at, updated_at)
			 VALUES (?, ?, ?, 'want_to_read', 0, 1, ?, ?, ?)
			 ON CONFLICT(user_id, subject_type, subject_id) DO UPDATE SET
				featured_on_profile = 1,
				featured_order = excluded.featured_order,
				updated_at = excluded.updated_at`
		)
		.bind(userFeatureLink.userId, subjectType, subjectId, featuredOrder, now, now)
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
