CREATE TABLE theme_books (
	theme_id TEXT NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
	book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
	added_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (theme_id, book_id)
);

CREATE INDEX idx_theme_books_book ON theme_books(book_id, theme_id);

INSERT OR IGNORE INTO theme_books (theme_id, book_id, added_by_user_id, created_at)
SELECT sessions.theme_id, session_subjects.subject_id, session_subjects.added_by_user_id,
	MIN(session_subjects.created_at)
FROM session_subjects
INNER JOIN sessions ON sessions.id = session_subjects.session_id
WHERE sessions.theme_id IS NOT NULL
	AND session_subjects.subject_type = 'book'
	AND session_subjects.status IN ('starter', 'featured')
GROUP BY sessions.theme_id, session_subjects.subject_id;
