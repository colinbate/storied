-- Migration number: 0024    Idempotent day-before RSVP reminder delivery

CREATE TABLE session_reminder_deliveries (
	id TEXT PRIMARY KEY,
	session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
	attendee_id TEXT NOT NULL,
	participant_id TEXT NOT NULL,
	recipient_email TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'sending',
	failure_reason TEXT,
	attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	sent_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX session_reminder_deliveries_session_attendee_unique
	ON session_reminder_deliveries(session_id, attendee_id);

CREATE INDEX idx_session_reminder_deliveries_session_status
	ON session_reminder_deliveries(session_id, status, attempted_at);
