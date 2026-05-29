-- Migration number: 0016    Private messages

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'direct',
  created_by_user_id TEXT NOT NULL,
  last_message_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_conversations_last_message
  ON conversations(last_message_at);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  last_read_message_id TEXT,
  last_read_at TEXT,
  muted_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversation_members_user
  ON conversation_members(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_conversation_members_user_archived
  ON conversation_members(user_id, archived_at);

CREATE TABLE IF NOT EXISTS private_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  body_source TEXT NOT NULL,
  body_html TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_private_messages_conversation_created
  ON private_messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_private_messages_author
  ON private_messages(author_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_private_messages_deleted
  ON private_messages(deleted_at);

CREATE TABLE IF NOT EXISTS direct_conversation_keys (
  user_a_id TEXT NOT NULL,
  user_b_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_a_id, user_b_id),
  FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS direct_conversation_keys_conversation_unique
  ON direct_conversation_keys(conversation_id);
