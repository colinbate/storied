-- Migration number: 0001 	 2026-04-16T21:26:17.946Z
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  starts_at TEXT,
  theme TEXT,
  astro_path TEXT,
  external_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_private INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  session_id TEXT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  body_source TEXT NOT NULL,
  body_html TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'members' CHECK (visibility IN ('public', 'members', 'admins')),
  is_locked INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0, 1)),
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
  reply_count INTEGER NOT NULL DEFAULT 0,
  last_post_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  parent_post_id TEXT,
  body_source TEXT NOT NULL,
  body_html TEXT NOT NULL,
  edit_count INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (parent_post_id) REFERENCES posts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (post_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  thread_id TEXT,
  category_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('immediate', 'daily_digest', 'mute')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  CHECK ((thread_id IS NOT NULL) OR (category_id IS NOT NULL)),
  UNIQUE (user_id, thread_id),
  UNIQUE (user_id, category_id)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY,
  email_enabled INTEGER NOT NULL DEFAULT 1 CHECK (email_enabled IN (0, 1)),
  marketing_enabled INTEGER NOT NULL DEFAULT 0 CHECK (marketing_enabled IN (0, 1)),
  digest_hour_utc INTEGER CHECK (digest_hour_utc BETWEEN 0 AND 23),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('reply', 'mention', 'new_thread', 'digest', 'announcement')),
  thread_id TEXT,
  post_id TEXT,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  available_at TEXT,
  sent_at TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS book_sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('goodreads', 'amazon', 'openlibrary', 'googlebooks', 'manual')),
  source_key TEXT NOT NULL,
  canonical_book_id TEXT,
  raw_url TEXT NOT NULL,
  fetch_status TEXT NOT NULL DEFAULT 'pending' CHECK (fetch_status IN ('pending', 'resolved', 'failed', 'ignored')),
  last_fetched_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (canonical_book_id) REFERENCES books(id) ON DELETE SET NULL,
  UNIQUE (source_type, source_key)
);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  author_text TEXT,
  cover_url TEXT,
  isbn13 TEXT,
  open_library_id TEXT,
  google_books_id TEXT,
  amazon_asin TEXT,
  goodreads_work_id TEXT,
  first_publish_year INTEGER,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (isbn13),
  UNIQUE (open_library_id),
  UNIQUE (google_books_id),
  UNIQUE (amazon_asin),
  UNIQUE (goodreads_work_id)
);

CREATE TABLE IF NOT EXISTS post_books (
  post_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  context TEXT NOT NULL DEFAULT 'linked' CHECK (context IN ('linked', 'mentioned', 'recommended')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (post_id, book_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_id TEXT,
  thread_id TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'considering', 'selected', 'read')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS moderation_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'thread', 'post', 'book', 'recommendation')),
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS auth_magic_links (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  email TEXT,
  code_hash TEXT NOT NULL UNIQUE,
  created_by_user_id TEXT NOT NULL,
  claimed_by_user_id TEXT,
  expires_at TEXT,
  claimed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (claimed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS thread_tags (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS thread_tag_links (
  thread_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (thread_id, tag_id),
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES thread_tags(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_slug ON sessions(slug);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order, name);
CREATE INDEX IF NOT EXISTS idx_threads_category_last_post ON threads(category_id, is_pinned DESC, last_post_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_author ON threads(author_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_session ON threads(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_visibility ON threads(visibility, deleted_at, last_post_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_thread_created ON posts(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reactions_post ON reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_status ON notification_events(status, available_at, created_at);
CREATE INDEX IF NOT EXISTS idx_book_sources_status ON book_sources(fetch_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_post_books_book ON post_books(book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_session ON recommendations(session_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_book ON recommendations(book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_events_target ON moderation_events(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON auth_magic_links(email, expires_at);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email, expires_at);

-- Seed categories suitable for a small book club.
INSERT OR IGNORE INTO categories (id, slug, name, description, sort_order)
VALUES
  ('cat_general', 'general', 'General', 'General discussion for members.', 10),
  ('cat_announcements', 'announcements', 'Announcements', 'Moderator and organizer announcements.', 20),
  ('cat_recommendations', 'recommendations', 'Recommendations', 'Book recommendations and reading suggestions.', 30),
  ('cat_current_read', 'current-read', 'Current Read', 'Discussion for the active book or theme.', 40),
  ('cat_off_topic', 'off-topic', 'Off Topic', 'Everything else.', 50);
