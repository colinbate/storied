-- Migration number: 0010    Club identity and session participation

-- =========================================================
-- authors: first-class subjects alongside books and series
-- =========================================================

CREATE TABLE IF NOT EXISTS authors (
	id TEXT PRIMARY KEY,
	slug TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL,
	bio TEXT,
	photo_url TEXT,
	goodreads_url TEXT,
	open_library_id TEXT,
	website_url TEXT,
	deleted_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_authors_slug ON authors(slug);
CREATE INDEX IF NOT EXISTS idx_authors_name ON authors(name);
CREATE INDEX IF NOT EXISTS idx_authors_deleted_at ON authors(deleted_at);

CREATE TABLE IF NOT EXISTS book_authors (
	book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
	author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
	display_order INTEGER NOT NULL DEFAULT 0,
	linked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (book_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_book_authors_book ON book_authors(book_id, display_order);
CREATE INDEX IF NOT EXISTS idx_book_authors_author ON book_authors(author_id);

CREATE TABLE IF NOT EXISTS series_authors (
	series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
	author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
	display_order INTEGER NOT NULL DEFAULT 0,
	linked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (series_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_series_authors_series ON series_authors(series_id, display_order);
CREATE INDEX IF NOT EXISTS idx_series_authors_author ON series_authors(author_id);

-- =========================================================
-- user_profiles: club-facing identity separate from accounts
-- =========================================================

CREATE TABLE IF NOT EXISTS user_profiles (
	user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	headline TEXT,
	bio TEXT,
	favorite_genres_text TEXT,
	location_text TEXT,
	website_url TEXT,
	show_read_books INTEGER NOT NULL DEFAULT 1,
	show_recommendations INTEGER NOT NULL DEFAULT 1,
	show_profile INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

ALTER TABLE user_subjects ADD COLUMN contains_spoilers INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_subjects ADD COLUMN featured_on_profile INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_subjects ADD COLUMN featured_order INTEGER;

-- =========================================================
-- session_participants: member relationship to a session
-- =========================================================

CREATE TABLE IF NOT EXISTS session_participants (
	session_id TEXT NOT NULL
		REFERENCES sessions(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL
		REFERENCES users(id) ON DELETE CASCADE,
	attendance_status TEXT NOT NULL DEFAULT 'attending',
	rsvp_source TEXT,
	note TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_session_participants_user
	ON session_participants(user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_session_participants_session_status
	ON session_participants(session_id, attendance_status, updated_at);

CREATE TABLE IF NOT EXISTS session_participant_subjects (
	session_id TEXT NOT NULL,
	user_id TEXT NOT NULL,
	subject_type TEXT NOT NULL,
	subject_id TEXT NOT NULL,
	relation_type TEXT NOT NULL DEFAULT 'read_for_session',
	is_primary_pick INTEGER NOT NULL DEFAULT 0,
	is_theme_related INTEGER NOT NULL DEFAULT 1,
	note TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (session_id, user_id, subject_type, subject_id),
	FOREIGN KEY (session_id, user_id)
		REFERENCES session_participants(session_id, user_id)
		ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_participant_subjects_session_subject
	ON session_participant_subjects(session_id, subject_type, subject_id);

CREATE INDEX IF NOT EXISTS idx_session_participant_subjects_user
	ON session_participant_subjects(user_id, created_at);
