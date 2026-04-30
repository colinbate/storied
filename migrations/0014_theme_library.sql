-- Migration number: 0014 	 2026-04-29T00:00:00.000Z
-- Add a curated theme library while preserving per-session public theme copy.

CREATE TABLE IF NOT EXISTS themes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  example_text TEXT,
  status TEXT NOT NULL DEFAULT 'idea',
  submitted_by_user_id TEXT,
  selected_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_themes_status_name
  ON themes(status, name);

CREATE INDEX IF NOT EXISTS idx_themes_submitted_by
  ON themes(submitted_by_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_themes_selected_at
  ON themes(selected_at);

ALTER TABLE sessions
  ADD COLUMN theme_id TEXT REFERENCES themes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_theme_id
  ON sessions(theme_id);

INSERT INTO themes (
  id,
  slug,
  name,
  status,
  selected_at
)
SELECT
  'theme_' || min(id),
  'historic-' || min(slug),
  min(coalesce(theme_title, theme)),
  'selected',
  min(starts_at)
FROM sessions
WHERE coalesce(theme_title, theme) IS NOT NULL
  AND trim(coalesce(theme_title, theme)) != ''
GROUP BY lower(trim(coalesce(theme_title, theme)));

UPDATE sessions
SET theme_id = (
  SELECT 'theme_' || min(s2.id)
  FROM sessions s2
  WHERE lower(trim(coalesce(s2.theme_title, s2.theme))) =
    lower(trim(coalesce(sessions.theme_title, sessions.theme)))
)
WHERE coalesce(theme_title, theme) IS NOT NULL
  AND trim(coalesce(theme_title, theme)) != '';
