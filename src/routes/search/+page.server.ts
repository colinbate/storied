import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { searchSessions, searchSubjects, searchThreads } from '$shared/search';
import { authors, books, sessions, series } from '$lib/server/db/schema';
import { and, inArray, isNull } from 'drizzle-orm';
import type { SubjectType } from '$shared/worker-messages';
import { mapThreadListSqlRow, type ThreadListSqlRow } from '$lib/server/discussions';

const RESULT_LIMIT = 8;

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const q = url.searchParams.get('q')?.trim() ?? '';
	if (!q) {
		return {
			q,
			threads: [],
			sessions: [],
			subjects: []
		};
	}

	const [threadCandidates, sessionCandidates, subjectCandidates] = await Promise.all([
		searchThreads(locals.db.$client, q, RESULT_LIMIT),
		searchSessions(locals.db.$client, q, RESULT_LIMIT),
		searchSubjects(locals.db.$client, q, RESULT_LIMIT + 4)
	]);

	const [threadResults, sessionResults, subjectResults] = await Promise.all([
		loadThreadResults(locals.db, threadCandidates, locals.permissions.has('admin:view')),
		loadSessionResults(locals.db, sessionCandidates),
		loadSubjectResults(locals.db, subjectCandidates)
	]);

	return {
		q,
		threads: threadResults,
		sessions: sessionResults,
		subjects: subjectResults
	};
};

async function loadThreadResults(
	db: App.Locals['db'],
	candidates: { id: string; rank: number }[],
	isAdmin: boolean
) {
	if (candidates.length === 0) return [];

	type SearchThreadSqlRow = ThreadListSqlRow & {
		categoryName: string;
		categorySlug: string;
		position: number;
	};

	const candidateJson = JSON.stringify(
		candidates.map((candidate, position) => ({ id: candidate.id, position }))
	);

	const { results: rows = [] } = await db.$client
		.prepare(
			`WITH candidate_threads AS (
				SELECT
					json_extract(value, '$.id') AS id,
					json_extract(value, '$.position') AS position
				FROM json_each(?)
			),
			listed_threads AS (
				SELECT t.*, candidate_threads.position
				FROM candidate_threads
				INNER JOIN threads t ON t.id = candidate_threads.id
				WHERE t.deleted_at IS NULL
					AND (? = 1 OR t.visibility <> 'admins')
			)
			SELECT
				t.id AS threadId,
				t.category_id AS threadCategoryId,
				t.author_user_id AS threadAuthorUserId,
				t.session_id AS threadSessionId,
				t.session_thread_role AS threadSessionThreadRole,
				t.title AS threadTitle,
				t.slug AS threadSlug,
				t.body_source AS threadBodySource,
				t.body_html AS threadBodyHtml,
				t.visibility AS threadVisibility,
				t.is_locked AS threadIsLocked,
				t.is_pinned AS threadIsPinned,
				t.reply_count AS threadReplyCount,
				t.last_post_at AS threadLastPostAt,
				t.deleted_at AS threadDeletedAt,
				t.created_at AS threadCreatedAt,
				t.updated_at AS threadUpdatedAt,
				author.id AS authorId,
				author.display_name AS authorDisplayName,
				author.avatar_url AS authorAvatarUrl,
				category.name AS categoryName,
				category.slug AS categorySlug,
				t.position AS position,
				COALESCE((
					SELECT json_group_array(json_object(
						'id', participant.id,
						'displayName', participant.displayName,
						'avatarUrl', participant.avatarUrl,
						'lastActivityAt', participant.lastActivityAt
					))
					FROM (
						SELECT u.id, u.display_name AS displayName, u.avatar_url AS avatarUrl, max(p.created_at) AS lastActivityAt
						FROM posts p
						INNER JOIN users u ON u.id = p.author_user_id
						WHERE p.thread_id = t.id AND p.deleted_at IS NULL
						GROUP BY u.id, u.display_name, u.avatar_url
						ORDER BY lastActivityAt DESC
					) participant
				), '[]') AS participantsJson
			FROM listed_threads t
			INNER JOIN users author ON author.id = t.author_user_id
			INNER JOIN categories category ON category.id = t.category_id
			ORDER BY t.position`
		)
		.bind(candidateJson, isAdmin ? 1 : 0)
		.all<SearchThreadSqlRow>();

	return rows.map((row) => ({
		...mapThreadListSqlRow(row),
		category: {
			name: row.categoryName,
			slug: row.categorySlug
		}
	}));
}

async function loadSessionResults(
	db: App.Locals['db'],
	candidates: { id: string; rank: number }[]
) {
	if (candidates.length === 0) return [];

	const rankById = new Map(candidates.map((candidate, index) => [candidate.id, index]));
	const ids = candidates.map((candidate) => candidate.id);
	const rows = await db.select().from(sessions).where(inArray(sessions.id, ids)).all();

	return rows.sort((a, b) => (rankById.get(a.id) ?? Infinity) - (rankById.get(b.id) ?? Infinity));
}

async function loadSubjectResults(
	db: App.Locals['db'],
	candidates: { subjectType: SubjectType; subjectId: string; rank: number }[]
) {
	if (candidates.length === 0) return [];

	const order = new Map(
		candidates.map((candidate, index) => [`${candidate.subjectType}:${candidate.subjectId}`, index])
	);
	const idsByType = {
		book: candidates
			.filter((candidate) => candidate.subjectType === 'book')
			.map((candidate) => candidate.subjectId),
		series: candidates
			.filter((candidate) => candidate.subjectType === 'series')
			.map((candidate) => candidate.subjectId),
		author: candidates
			.filter((candidate) => candidate.subjectType === 'author')
			.map((candidate) => candidate.subjectId)
	};

	const [bookRows, seriesRows, authorRows] = await Promise.all([
		idsByType.book.length
			? db
					.select()
					.from(books)
					.where(and(inArray(books.id, idsByType.book), isNull(books.deletedAt)))
					.all()
			: [],
		idsByType.series.length
			? db
					.select()
					.from(series)
					.where(and(inArray(series.id, idsByType.series), isNull(series.deletedAt)))
					.all()
			: [],
		idsByType.author.length
			? db
					.select()
					.from(authors)
					.where(and(inArray(authors.id, idsByType.author), isNull(authors.deletedAt)))
					.all()
			: []
	]);

	return [
		...bookRows.map((subject) => ({ type: 'book' as const, subject })),
		...seriesRows.map((subject) => ({ type: 'series' as const, subject })),
		...authorRows.map((subject) => ({ type: 'author' as const, subject }))
	].sort(
		(a, b) =>
			(order.get(`${a.type}:${a.subject.id}`) ?? Infinity) -
			(order.get(`${b.type}:${b.subject.id}`) ?? Infinity)
	);
}
