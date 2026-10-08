CREATE TABLE post_reactions (
  id TEXT PRIMARY KEY NOT NULL,
  target_key TEXT NOT NULL,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (target_key = CASE WHEN post_id IS NULL THEN 'thread:' || thread_id ELSE 'post:' || post_id END)
);
CREATE UNIQUE INDEX post_reactions_target_user_emoji_unique ON post_reactions(target_key, user_id, emoji);
CREATE INDEX idx_post_reactions_thread ON post_reactions(thread_id, target_key);
CREATE INDEX idx_post_reactions_target_created ON post_reactions(target_key, created_at);

CREATE TRIGGER post_reactions_same_thread BEFORE INSERT ON post_reactions
WHEN NEW.post_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM posts WHERE id = NEW.post_id AND thread_id = NEW.thread_id
)
BEGIN
  SELECT RAISE(ABORT, 'Reaction reply must belong to its thread');
END;

-- Keep the limit atomic, including simultaneous requests for a new emoji.
CREATE TRIGGER post_reactions_emoji_limit BEFORE INSERT ON post_reactions
WHEN NOT EXISTS (
  SELECT 1 FROM post_reactions WHERE target_key = NEW.target_key AND emoji = NEW.emoji
) AND (
  SELECT COUNT(DISTINCT emoji) FROM post_reactions WHERE target_key = NEW.target_key
) >= 20
BEGIN
  SELECT RAISE(IGNORE);
END;

CREATE TABLE reaction_notification_state (
  target_key TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  last_notified_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
  last_reaction_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'
);
