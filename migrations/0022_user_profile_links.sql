-- Extensible links to members' profiles on Goodreads, Hardcover, and other sites.

CREATE TABLE user_profile_links (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_user_profile_links_user_order
  ON user_profile_links(user_id, display_order);

CREATE UNIQUE INDEX user_profile_links_user_url_unique
  ON user_profile_links(user_id, url);
