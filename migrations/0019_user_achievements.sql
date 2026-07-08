-- Migration number: 0019    Reusable member achievements

CREATE TABLE user_achievements (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'challenge',
  metadata_json TEXT,
  awarded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX user_achievements_user_key_unique
  ON user_achievements(user_id, achievement_key);

CREATE INDEX idx_user_achievements_key
  ON user_achievements(achievement_key, awarded_at);
