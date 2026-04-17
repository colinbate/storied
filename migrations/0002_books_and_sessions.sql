-- Migration number: 0002    Phase 2: Books, User Books, Session Books

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  author_text TEXT,
  cover_url TEXT,
  isbn13 TEXT,
  open_library_id TEXT,
  google_books_id TEXT,
  amazon_asin TEXT,
  goodreads_url TEXT,
  first_publish_year INTEGER,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS book_sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('goodreads', 'amazon', 'openlibrary', 'googlebooks', 'manual')),
  source_url TEXT NOT NULL,
  source_key TEXT NOT NULL,
  canonical_book_id TEXT,
  raw_metadata TEXT,
  fetch_status TEXT NOT NULL DEFAULT 'pending' CHECK (fetch_status IN ('pending', 'resolved', 'failed', 'ignored')),
  last_fetched_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (canonical_book_id) REFERENCES books(id) ON DELETE SET NULL,
  UNIQUE (source_type, source_key)
);

CREATE TABLE IF NOT EXISTS post_books (
  id TEXT PRIMARY KEY,
  post_id TEXT,
  thread_id TEXT,
  book_id TEXT NOT NULL,
  book_source_id TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  context TEXT NOT NULL DEFAULT 'linked' CHECK (context IN ('linked', 'mentioned', 'recommended')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  FOREIGN KEY (book_source_id) REFERENCES book_sources(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_books (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  reading_status TEXT NOT NULL DEFAULT 'want_to_read',
  is_recommended INTEGER NOT NULL DEFAULT 0 CHECK (is_recommended IN (0, 1)),
  note TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  UNIQUE (user_id, book_id)
);

CREATE TABLE IF NOT EXISTS session_books (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'mentioned',
  source_thread_id TEXT,
  added_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  FOREIGN KEY (source_thread_id) REFERENCES threads(id) ON DELETE SET NULL,
  FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (session_id, book_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_books_slug ON books(slug);
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_book_sources_status ON book_sources(fetch_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_book_sources_book ON book_sources(canonical_book_id);
CREATE INDEX IF NOT EXISTS idx_post_books_thread ON post_books(thread_id, display_order);
CREATE INDEX IF NOT EXISTS idx_post_books_post ON post_books(post_id, display_order);
CREATE INDEX IF NOT EXISTS idx_post_books_book ON post_books(book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_books_user ON user_books(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_books_book ON user_books(book_id);
CREATE INDEX IF NOT EXISTS idx_session_books_session ON session_books(session_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_books_book ON session_books(book_id);
