import type { SubjectType } from '../worker-messages';

export type SearchTopic = 'thread' | 'session' | 'subject';

export interface SearchThreadPayload {
	threadId: string;
}

export interface SearchSessionPayload {
	sessionId: string;
}

export interface SearchSubjectPayload {
	subjectType: SubjectType;
	subjectId: string;
}

export type SearchRebuildPayload = {
	scope?: SearchTopic | 'all';
};

export interface SearchCandidate {
	id: string;
	rank: number;
}

export interface SubjectSearchCandidate {
	subjectType: SubjectType;
	subjectId: string;
	rank: number;
}

const MAX_TOKENS = 12;

export function buildFtsAndQuery(input: string): string | null {
	const tokens = input
		.trim()
		.split(/\s+/)
		.map((token) => token.trim())
		.filter((token) => /[\p{L}\p{N}]/u.test(token))
		.slice(0, MAX_TOKENS);

	if (tokens.length === 0) return null;

	return tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(' ');
}

export async function searchThreads(
	db: D1Database,
	query: string,
	limit = 8
): Promise<SearchCandidate[]> {
	const ftsQuery = buildFtsAndQuery(query);
	if (!ftsQuery) return [];

	const { results } = await db
		.prepare(
			`SELECT thread_id AS id, bm25(thread_search) AS rank
			 FROM thread_search
			 WHERE thread_search MATCH ?
			 ORDER BY rank
			 LIMIT ?`
		)
		.bind(ftsQuery, limit)
		.all<SearchCandidate>();

	return results ?? [];
}

export async function searchSessions(
	db: D1Database,
	query: string,
	limit = 8
): Promise<SearchCandidate[]> {
	const ftsQuery = buildFtsAndQuery(query);
	if (!ftsQuery) return [];

	const { results } = await db
		.prepare(
			`SELECT session_id AS id, bm25(session_search) AS rank
			 FROM session_search
			 WHERE session_search MATCH ?
			 ORDER BY rank
			 LIMIT ?`
		)
		.bind(ftsQuery, limit)
		.all<SearchCandidate>();

	return results ?? [];
}

export async function searchSubjects(
	db: D1Database,
	query: string,
	limit = 12
): Promise<SubjectSearchCandidate[]> {
	const ftsQuery = buildFtsAndQuery(query);
	if (!ftsQuery) return [];

	const { results } = await db
		.prepare(
			`SELECT subject_type AS subjectType, subject_id AS subjectId, bm25(subject_search) AS rank
			 FROM subject_search
			 WHERE subject_search MATCH ?
			 ORDER BY rank
			 LIMIT ?`
		)
		.bind(ftsQuery, limit)
		.all<SubjectSearchCandidate>();

	return results ?? [];
}

export async function reindexSubject(
	db: D1Database,
	subjectType: SubjectType,
	subjectId: string
): Promise<void> {
	await db
		.prepare(`DELETE FROM subject_search WHERE subject_type = ? AND subject_id = ?`)
		.bind(subjectType, subjectId)
		.run();

	if (subjectType === 'book') {
		await insertBookSearchRow(db, subjectId);
		return;
	}
	if (subjectType === 'series') {
		await insertSeriesSearchRow(db, subjectId);
		return;
	}
	await insertAuthorSearchRow(db, subjectId);
}

export async function reindexThread(db: D1Database, threadId: string): Promise<void> {
	await db.prepare(`DELETE FROM thread_search WHERE thread_id = ?`).bind(threadId).run();

	await db
		.prepare(
			`INSERT INTO thread_search (
				thread_id,
				title,
				body,
				category,
				session,
				subjects,
				authors
			)
			SELECT
				t.id,
				t.title,
				trim(COALESCE(t.body_source, '') || ' ' || COALESCE((
					SELECT group_concat(p.body_source, ' ')
					FROM posts p
					WHERE p.thread_id = t.id AND p.deleted_at IS NULL
				), '')),
				c.name,
				trim(COALESCE(s.title, '') || ' ' || COALESCE(s.theme, '') || ' ' || COALESCE(s.theme_title, '') || ' ' || COALESCE(s.theme_summary, '')),
				COALESCE((
					SELECT group_concat(label, ' ')
					FROM (
						SELECT b.title || ' ' || COALESCE(b.subtitle, '') AS label
						FROM thread_subjects ts
						JOIN books b ON ts.subject_type = 'book' AND ts.subject_id = b.id
						WHERE ts.thread_id = t.id AND b.deleted_at IS NULL
						UNION ALL
						SELECT se.title AS label
						FROM thread_subjects ts
						JOIN series se ON ts.subject_type = 'series' AND ts.subject_id = se.id
						WHERE ts.thread_id = t.id AND se.deleted_at IS NULL
						UNION ALL
						SELECT a.name AS label
						FROM thread_subjects ts
						JOIN authors a ON ts.subject_type = 'author' AND ts.subject_id = a.id
						WHERE ts.thread_id = t.id AND a.deleted_at IS NULL
					)
				), ''),
				COALESCE((
					SELECT group_concat(label, ' ')
					FROM (
						SELECT COALESCE(b.author_text, '') AS label
						FROM thread_subjects ts
						JOIN books b ON ts.subject_type = 'book' AND ts.subject_id = b.id
						WHERE ts.thread_id = t.id AND b.deleted_at IS NULL
						UNION ALL
						SELECT COALESCE(se.author_text, '') AS label
						FROM thread_subjects ts
						JOIN series se ON ts.subject_type = 'series' AND ts.subject_id = se.id
						WHERE ts.thread_id = t.id AND se.deleted_at IS NULL
						UNION ALL
						SELECT a.name AS label
						FROM thread_subjects ts
						JOIN authors a ON ts.subject_type = 'author' AND ts.subject_id = a.id
						WHERE ts.thread_id = t.id AND a.deleted_at IS NULL
					)
				), '')
			FROM threads t
			JOIN categories c ON c.id = t.category_id
			LEFT JOIN sessions s ON s.id = t.session_id
			WHERE t.id = ? AND t.deleted_at IS NULL`
		)
		.bind(threadId)
		.run();
}

export async function reindexSession(db: D1Database, sessionId: string): Promise<void> {
	await db.prepare(`DELETE FROM session_search WHERE session_id = ?`).bind(sessionId).run();

	await db
		.prepare(
			`INSERT INTO session_search (
				session_id,
				title,
				theme,
				body,
				location,
				subjects,
				threads
			)
			SELECT
				s.id,
				s.title,
				trim(COALESCE(s.theme, '') || ' ' || COALESCE(s.theme_title, '') || ' ' || COALESCE(s.theme_summary, '')),
				trim(COALESCE(s.body_source, '') || ' ' || COALESCE(s.body_html, '') || ' ' || COALESCE(s.theme_summary, '')),
				COALESCE(s.location_name, ''),
				COALESCE((
					SELECT group_concat(label, ' ')
					FROM (
						SELECT b.title || ' ' || COALESCE(b.subtitle, '') || ' ' || COALESCE(b.author_text, '') AS label
						FROM session_subjects ss
						JOIN books b ON ss.subject_type = 'book' AND ss.subject_id = b.id
						WHERE ss.session_id = s.id AND b.deleted_at IS NULL
						UNION ALL
						SELECT se.title || ' ' || COALESCE(se.author_text, '') AS label
						FROM session_subjects ss
						JOIN series se ON ss.subject_type = 'series' AND ss.subject_id = se.id
						WHERE ss.session_id = s.id AND se.deleted_at IS NULL
						UNION ALL
						SELECT a.name AS label
						FROM session_subjects ss
						JOIN authors a ON ss.subject_type = 'author' AND ss.subject_id = a.id
						WHERE ss.session_id = s.id AND a.deleted_at IS NULL
					)
				), ''),
				COALESCE((
					SELECT group_concat(t.title, ' ')
					FROM threads t
					WHERE t.session_id = s.id AND t.deleted_at IS NULL
				), '')
			FROM sessions s
			WHERE s.id = ?`
		)
		.bind(sessionId)
		.run();
}

export async function rebuildSearchIndex(
	db: D1Database,
	scope: SearchRebuildPayload['scope'] = 'all'
): Promise<void> {
	if (!scope || scope === 'all' || scope === 'subject') {
		await db.prepare(`DELETE FROM subject_search`).run();
		const books = await db.prepare(`SELECT id FROM books`).all<{ id: string }>();
		for (const row of books.results ?? []) await reindexSubject(db, 'book', row.id);
		const series = await db.prepare(`SELECT id FROM series`).all<{ id: string }>();
		for (const row of series.results ?? []) await reindexSubject(db, 'series', row.id);
		const authors = await db.prepare(`SELECT id FROM authors`).all<{ id: string }>();
		for (const row of authors.results ?? []) await reindexSubject(db, 'author', row.id);
	}

	if (!scope || scope === 'all' || scope === 'thread') {
		await db.prepare(`DELETE FROM thread_search`).run();
		const threads = await db.prepare(`SELECT id FROM threads`).all<{ id: string }>();
		for (const row of threads.results ?? []) await reindexThread(db, row.id);
	}

	if (!scope || scope === 'all' || scope === 'session') {
		await db.prepare(`DELETE FROM session_search`).run();
		const sessions = await db.prepare(`SELECT id FROM sessions`).all<{ id: string }>();
		for (const row of sessions.results ?? []) await reindexSession(db, row.id);
	}
}

async function insertBookSearchRow(db: D1Database, bookId: string) {
	await db
		.prepare(
			`INSERT INTO subject_search (
				subject_type,
				subject_id,
				title,
				subtitle,
				authors,
				description,
				identifiers,
				series,
				books,
				genres
			)
			SELECT
				'book',
				b.id,
				b.title,
				COALESCE(b.subtitle, ''),
				trim(COALESCE(b.author_text, '') || ' ' || COALESCE((
					SELECT group_concat(a.name, ' ')
					FROM book_authors ba
					JOIN authors a ON a.id = ba.author_id
					WHERE ba.book_id = b.id AND a.deleted_at IS NULL
				), '')),
				COALESCE(b.description, ''),
				trim(COALESCE(b.isbn13, '') || ' ' || COALESCE(b.open_library_id, '') || ' ' || COALESCE(b.google_books_id, '') || ' ' || COALESCE(b.amazon_asin, '') || ' ' || COALESCE((
					SELECT group_concat(source_key, ' ')
					FROM subject_sources
					WHERE subject_type = 'book' AND subject_id = b.id
				), '')),
				COALESCE((
					SELECT group_concat(se.title, ' ')
					FROM series_books sb
					JOIN series se ON se.id = sb.series_id
					WHERE sb.book_id = b.id AND se.deleted_at IS NULL
				), ''),
				'',
				COALESCE((
					SELECT group_concat(g.name, ' ')
					FROM genre_links gl
					JOIN genres g ON g.id = gl.genre_id
					WHERE gl.subject_type = 'book' AND gl.subject_id = b.id
				), '')
			FROM books b
			WHERE b.id = ? AND b.deleted_at IS NULL`
		)
		.bind(bookId)
		.run();
}

async function insertSeriesSearchRow(db: D1Database, seriesId: string) {
	await db
		.prepare(
			`INSERT INTO subject_search (
				subject_type,
				subject_id,
				title,
				subtitle,
				authors,
				description,
				identifiers,
				series,
				books,
				genres
			)
			SELECT
				'series',
				se.id,
				se.title,
				'',
				trim(COALESCE(se.author_text, '') || ' ' || COALESCE((
					SELECT group_concat(a.name, ' ')
					FROM series_authors sa
					JOIN authors a ON a.id = sa.author_id
					WHERE sa.series_id = se.id AND a.deleted_at IS NULL
				), '')),
				COALESCE(se.description, ''),
				trim(COALESCE(se.amazon_asin, '') || ' ' || COALESCE((
					SELECT group_concat(source_key, ' ')
					FROM subject_sources
					WHERE subject_type = 'series' AND subject_id = se.id
				), '')),
				'',
				COALESCE((
					SELECT group_concat(b.title || ' ' || COALESCE(b.subtitle, ''), ' ')
					FROM series_books sb
					JOIN books b ON b.id = sb.book_id
					WHERE sb.series_id = se.id AND b.deleted_at IS NULL
				), ''),
				COALESCE((
					SELECT group_concat(g.name, ' ')
					FROM genre_links gl
					JOIN genres g ON g.id = gl.genre_id
					WHERE gl.subject_type = 'series' AND gl.subject_id = se.id
				), '')
			FROM series se
			WHERE se.id = ? AND se.deleted_at IS NULL`
		)
		.bind(seriesId)
		.run();
}

async function insertAuthorSearchRow(db: D1Database, authorId: string) {
	await db
		.prepare(
			`INSERT INTO subject_search (
				subject_type,
				subject_id,
				title,
				subtitle,
				authors,
				description,
				identifiers,
				series,
				books,
				genres
			)
			SELECT
				'author',
				a.id,
				a.name,
				'',
				a.name,
				COALESCE(a.bio, ''),
				trim(COALESCE(a.open_library_id, '') || ' ' || COALESCE((
					SELECT group_concat(source_key, ' ')
					FROM subject_sources
					WHERE subject_type = 'author' AND subject_id = a.id
				), '')),
				COALESCE((
					SELECT group_concat(se.title, ' ')
					FROM series_authors sa
					JOIN series se ON se.id = sa.series_id
					WHERE sa.author_id = a.id AND se.deleted_at IS NULL
				), ''),
				COALESCE((
					SELECT group_concat(b.title || ' ' || COALESCE(b.subtitle, ''), ' ')
					FROM book_authors ba
					JOIN books b ON b.id = ba.book_id
					WHERE ba.author_id = a.id AND b.deleted_at IS NULL
				), ''),
				COALESCE((
					SELECT group_concat(g.name, ' ')
					FROM genre_links gl
					JOIN genres g ON g.id = gl.genre_id
					WHERE gl.subject_type = 'author' AND gl.subject_id = a.id
				), '')
			FROM authors a
			WHERE a.id = ? AND a.deleted_at IS NULL`
		)
		.bind(authorId)
		.run();
}
