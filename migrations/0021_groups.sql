-- Discussion groups and optional group-restricted thread audiences.

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_by_user_id TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE group_memberships (
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  added_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE threads
  ADD COLUMN audience_group_id TEXT REFERENCES groups(id) ON DELETE RESTRICT;

CREATE INDEX idx_groups_archived_name ON groups(archived_at, name);
CREATE INDEX idx_groups_creator ON groups(created_by_user_id);
CREATE INDEX idx_group_memberships_user ON group_memberships(user_id, group_id);
CREATE INDEX idx_threads_audience_group
  ON threads(audience_group_id, deleted_at, last_post_at DESC);
