-- Per-member read position for bounded discussion loading and unread markers.

CREATE TABLE thread_read_states (
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
	last_read_post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
	last_read_post_created_at TEXT NOT NULL,
	last_read_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (user_id, thread_id)
);

CREATE INDEX idx_thread_read_states_user
	ON thread_read_states(user_id, last_read_at DESC);
