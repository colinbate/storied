-- Migration number: 0003 	 2026-04-17T18:23:31.775Z
DROP TABLE IF EXISTS post_books;
DROP TABLE IF EXISTS book_sources;
DROP TABLE IF EXISTS user_books;
DROP TABLE IF EXISTS session_books;

CREATE TABLE IF NOT EXISTS subject_sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_key TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  raw_metadata TEXT,
  fetch_status TEXT NOT NULL DEFAULT 'pending',
  last_fetched_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (source_type, source_key)
);

CREATE INDEX IF NOT EXISTS idx_subject_sources_status ON subject_sources(fetch_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_subject_sources_subject ON subject_sources(subject_type, subject_id);

CREATE TABLE IF NOT EXISTS thread_subjects (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  post_id TEXT,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  context TEXT NOT NULL DEFAULT 'linked',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  added_by TEXT,
  UNIQUE(thread_id, subject_type, subject_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_thread_subjects_thread ON thread_subjects(thread_id, display_order);
CREATE INDEX IF NOT EXISTS idx_thread_subjects_subject ON thread_subjects(subject_type, subject_id, created_at);

CREATE TABLE IF NOT EXISTS genres (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    parent_id INTEGER REFERENCES genres(id),
    description TEXT,
    is_speculative INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_genres_parent ON genres(parent_id, name);

CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  author_text TEXT,
  description TEXT,
  cover_url TEXT,
  amazon_asin TEXT,
  goodreads_url TEXT,
  is_complete INTEGER NOT NULL DEFAULT 0,
  book_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_series_slug ON series(slug);
CREATE INDEX IF NOT EXISTS idx_series_title ON series(title);

CREATE TABLE IF NOT EXISTS genre_links (
    genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    subject_type TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    confidence TEXT NOT NULL,
    linked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (genre_id, subject_type, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_genre_links_subject ON genre_links(subject_type, subject_id);

CREATE TABLE IF NOT EXISTS series_books (
    series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    position_sort REAL,
    position TEXT,
    linked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (series_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_series_books_series ON series_books(series_id, position_sort);
CREATE INDEX IF NOT EXISTS idx_series_books_book ON series_books(book_id);

CREATE TABLE IF NOT EXISTS user_subjects (
  user_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  reading_status TEXT NOT NULL DEFAULT 'want_to_read',
  is_recommended INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  rating INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, subject_type, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_user_subjects_user ON user_subjects(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_user_subjects_subject ON user_subjects(subject_type, subject_id);

CREATE TABLE IF NOT EXISTS session_subjects (
  session_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'mentioned',
  note TEXT,
  added_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (session_id, subject_type, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_session_subjects_session ON session_subjects(session_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_session_subjects_subject ON session_subjects(subject_type, subject_id);
