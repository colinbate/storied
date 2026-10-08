-- A start time or timezone change begins a new reminder schedule revision.
ALTER TABLE sessions ADD COLUMN reminder_revision INTEGER NOT NULL DEFAULT 1;

CREATE TRIGGER sessions_reminder_revision
AFTER UPDATE OF starts_at, timezone ON sessions
WHEN OLD.starts_at IS NOT NEW.starts_at OR OLD.timezone IS NOT NEW.timezone
BEGIN
	UPDATE sessions SET reminder_revision = OLD.reminder_revision + 1 WHERE id = NEW.id;
END;

DROP INDEX session_reminder_deliveries_session_attendee_unique;
ALTER TABLE session_reminder_deliveries ADD COLUMN schedule_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE session_reminder_deliveries ADD COLUMN schedule_starts_at TEXT;
ALTER TABLE session_reminder_deliveries ADD COLUMN schedule_timezone TEXT;
ALTER TABLE session_reminder_deliveries ADD COLUMN active_attempt_id TEXT;
ALTER TABLE session_reminder_deliveries ADD COLUMN lease_expires_at TEXT;
ALTER TABLE session_reminder_deliveries ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 1;

-- Old deliveries have no schedule snapshot; associate them with the current revision.
UPDATE session_reminder_deliveries SET
	schedule_starts_at = (SELECT starts_at FROM sessions WHERE id = session_id),
	schedule_timezone = (SELECT timezone FROM sessions WHERE id = session_id),
	active_attempt_id = id || ':legacy',
	lease_expires_at = CASE WHEN status = 'sending'
		THEN strftime('%Y-%m-%dT%H:%M:%fZ', attempted_at, '+10 minutes') ELSE NULL END;

CREATE UNIQUE INDEX session_reminder_deliveries_session_attendee_revision_unique
	ON session_reminder_deliveries(session_id, attendee_id, schedule_revision);

CREATE TABLE session_reminder_attempts (
	id TEXT PRIMARY KEY,
	delivery_id TEXT NOT NULL REFERENCES session_reminder_deliveries(id) ON DELETE CASCADE,
	recipient_email TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'sending',
	failure_reason TEXT,
	source TEXT NOT NULL,
	requested_by_user_id TEXT,
	attempted_at TEXT NOT NULL,
	completed_at TEXT
);

INSERT INTO session_reminder_attempts
	(id, delivery_id, recipient_email, status, failure_reason, source, attempted_at, completed_at)
SELECT active_attempt_id, id, recipient_email, status, failure_reason, 'scheduled', attempted_at,
	CASE WHEN status = 'sending' THEN NULL ELSE COALESCE(sent_at, updated_at) END
FROM session_reminder_deliveries;

CREATE INDEX idx_session_reminder_attempts_delivery ON session_reminder_attempts(delivery_id, attempted_at);
