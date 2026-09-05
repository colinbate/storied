-- Drafts are private preparation; scheduled sessions can accept RSVPs alongside the current one.
ALTER TABLE sessions ADD COLUMN rsvp_enabled INTEGER NOT NULL DEFAULT 1;

-- Preserve registration availability if an older installation has several current sessions.
UPDATE sessions SET status = 'scheduled'
WHERE status = 'current' AND id <> (
	SELECT id FROM sessions WHERE status = 'current'
	ORDER BY starts_at DESC, created_at DESC, id LIMIT 1
);
CREATE UNIQUE INDEX sessions_one_current ON sessions(status) WHERE status = 'current';
