-- Migration number: 0009    Sessions as first-class pages

-- =========================================================
-- sessions: expand to support authored session pages
-- =========================================================

ALTER TABLE sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE sessions ADD COLUMN theme_title TEXT;
ALTER TABLE sessions ADD COLUMN theme_summary TEXT;
ALTER TABLE sessions ADD COLUMN body_source TEXT;
ALTER TABLE sessions ADD COLUMN body_html TEXT;
ALTER TABLE sessions ADD COLUMN duration_minutes INTEGER;
ALTER TABLE sessions ADD COLUMN location_name TEXT;
ALTER TABLE sessions ADD COLUMN rsvp_slug TEXT;
ALTER TABLE sessions ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sessions_status_starts_at
	ON sessions(status, starts_at);

CREATE INDEX IF NOT EXISTS idx_sessions_is_public_starts_at
	ON sessions(is_public, starts_at);

UPDATE sessions
SET theme_title = COALESCE(theme_title, theme)
WHERE theme IS NOT NULL;

-- =========================================================
-- threads: mark the session relationship role
-- =========================================================

ALTER TABLE threads ADD COLUMN session_thread_role TEXT;

CREATE INDEX IF NOT EXISTS idx_threads_session_role
	ON threads(session_id, session_thread_role, created_at);

UPDATE threads
SET session_thread_role = 'primary'
WHERE session_id IS NOT NULL
  AND session_thread_role IS NULL;

-- =========================================================
-- session_subjects: migrate relationship statuses
-- =========================================================

UPDATE session_subjects
SET status = CASE status
	WHEN 'selected' THEN 'starter'
	WHEN 'featured' THEN 'featured'
	WHEN 'mentioned' THEN 'mentioned_off_theme'
	ELSE status
END;
