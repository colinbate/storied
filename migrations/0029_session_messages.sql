-- Migration number: 0029    Attendee messages sent from a session with per-recipient delivery audit

CREATE TABLE session_messages (
	id TEXT PRIMARY KEY,
	session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
	sender_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
	kind TEXT NOT NULL DEFAULT 'custom',
	audiences TEXT NOT NULL,
	subject TEXT NOT NULL,
	body_source TEXT NOT NULL,
	body_html TEXT NOT NULL,
	recipient_count INTEGER NOT NULL DEFAULT 0,
	sent_count INTEGER NOT NULL DEFAULT 0,
	failed_count INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_session_messages_session_created
	ON session_messages(session_id, created_at);

CREATE TABLE session_message_deliveries (
	id TEXT PRIMARY KEY,
	message_id TEXT NOT NULL REFERENCES session_messages(id) ON DELETE CASCADE,
	session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
	attendee_id TEXT NOT NULL,
	recipient_name TEXT NOT NULL,
	recipient_email TEXT NOT NULL,
	audience TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'sending',
	failure_reason TEXT,
	attempt_count INTEGER NOT NULL DEFAULT 0,
	attempted_at TEXT,
	sent_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX session_message_deliveries_message_attendee_unique
	ON session_message_deliveries(message_id, attendee_id);

CREATE INDEX idx_session_message_deliveries_message_status
	ON session_message_deliveries(message_id, status);
