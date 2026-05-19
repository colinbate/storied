-- Migration number: 0015    Member activity and session mention notifications

ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN last_activity_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_status_last_activity
  ON users(status, last_activity_at);

ALTER TABLE notification_preferences
  ADD COLUMN auto_subscribe_session_threads INTEGER NOT NULL DEFAULT 1
  CHECK (auto_subscribe_session_threads IN (0, 1));

-- Existing authenticated sessions are a reasonable signal that a member has
-- actually used the platform, while seeded accounts with no sessions stay NULL.
UPDATE users
SET
  last_login_at = (
    SELECT MAX(user_sessions.created_at)
    FROM user_sessions
    WHERE user_sessions.user_id = users.id
  ),
  last_activity_at = (
    SELECT MAX(user_sessions.created_at)
    FROM user_sessions
    WHERE user_sessions.user_id = users.id
  )
WHERE EXISTS (
  SELECT 1
  FROM user_sessions
  WHERE user_sessions.user_id = users.id
);

-- Bring opted-in active members into the primary current/past session threads.
-- This deliberately skips seeded members who have never logged in.
INSERT OR IGNORE INTO subscriptions (id, user_id, thread_id, mode)
SELECT
  'sub_session_' || u.id || '_' || t.id,
  u.id,
  t.id,
  np.default_sub_mode
FROM users u
INNER JOIN notification_preferences np ON np.user_id = u.id
INNER JOIN threads t
  ON t.session_thread_role = 'primary'
  AND t.deleted_at IS NULL
INNER JOIN sessions se
  ON se.id = t.session_id
  AND se.status IN ('current', 'past')
WHERE u.status = 'active'
  AND u.last_login_at IS NOT NULL
  AND np.auto_subscribe_session_threads = 1;
