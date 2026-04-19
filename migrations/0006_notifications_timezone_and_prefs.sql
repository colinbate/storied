-- Migration number: 0006 	 2026-04-19T03:21:14.681Z
-- Adds user timezone, renames digest_hour_utc to digest_hour_local, and
-- adds new columns to notification_preferences for notification scheduling
-- and auto-subscribe preference. Also backfills a notification_preferences
-- row for every existing user.

ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Atlantic/Bermuda';

-- Rename digest_hour_utc to digest_hour_local. The column is unused so
-- the rename is safe. D1 (SQLite >= 3.25) supports RENAME COLUMN.
ALTER TABLE notification_preferences RENAME COLUMN digest_hour_utc TO digest_hour_local;

-- Default subscription mode used when auto-subscribing to a thread.
ALTER TABLE notification_preferences
  ADD COLUMN default_sub_mode TEXT NOT NULL DEFAULT 'immediate'
  CHECK (default_sub_mode IN ('immediate', 'daily_digest'));

-- Whether to auto-subscribe the user to threads they create or reply to.
ALTER TABLE notification_preferences
  ADD COLUMN auto_subscribe_own INTEGER NOT NULL DEFAULT 1
  CHECK (auto_subscribe_own IN (0, 1));

-- When the last digest was delivered, used as the window start for the
-- next digest run. NULL means "hasn't received one yet".
ALTER TABLE notification_preferences ADD COLUMN last_digest_at TEXT;

-- Backfill a notification_preferences row for every existing user, so the
-- later code can rely on JOINing to it without additional fallbacks.
INSERT OR IGNORE INTO notification_preferences (user_id)
SELECT id FROM users;
