-- Migration number: 0013 	 2026-04-28T00:00:00.000Z
-- Rebuild notification_events without enum-style CHECK constraints on
-- event_type or status. Those values are managed in application code.

DROP INDEX IF EXISTS idx_notification_events_status;

ALTER TABLE notification_events RENAME TO notification_events_old;

CREATE TABLE notification_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  thread_id TEXT,
  post_id TEXT,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  available_at TEXT,
  sent_at TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

INSERT INTO notification_events (
  id,
  user_id,
  event_type,
  thread_id,
  post_id,
  payload_json,
  status,
  available_at,
  sent_at,
  failure_reason,
  created_at,
  updated_at
)
SELECT
  id,
  user_id,
  event_type,
  thread_id,
  post_id,
  payload_json,
  status,
  available_at,
  sent_at,
  failure_reason,
  created_at,
  updated_at
FROM notification_events_old;

DROP TABLE notification_events_old;

CREATE INDEX IF NOT EXISTS idx_notification_events_status
  ON notification_events(status, available_at, created_at);
