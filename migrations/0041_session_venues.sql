CREATE TABLE venues (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 meeting_format TEXT NOT NULL DEFAULT 'in_person' CHECK (meeting_format IN ('in_person', 'online', 'hybrid')),
 address TEXT,
 joining_url TEXT,
 accessibility_notes TEXT,
 archived_at TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_venues_archived_name ON venues(archived_at, name);

-- Sessions retain their own details so editing a saved venue cannot silently move a meeting.
ALTER TABLE sessions ADD COLUMN venue_id TEXT REFERENCES venues(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN meeting_format TEXT CHECK (meeting_format IN ('in_person', 'online', 'hybrid'));
ALTER TABLE sessions ADD COLUMN location_address TEXT;
ALTER TABLE sessions ADD COLUMN joining_url TEXT;
ALTER TABLE sessions ADD COLUMN accessibility_notes TEXT;

CREATE TRIGGER session_logistics_calendar_update
AFTER UPDATE OF meeting_format, location_address, joining_url, accessibility_notes ON sessions
WHEN OLD.meeting_format IS NOT NEW.meeting_format OR OLD.location_address IS NOT NEW.location_address
 OR OLD.joining_url IS NOT NEW.joining_url OR OLD.accessibility_notes IS NOT NEW.accessibility_notes
BEGIN
 UPDATE session_calendar_entries SET sequence = sequence + 1,
 changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE session_id = NEW.id;
END;
