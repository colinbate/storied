-- A read-only capability for one RSVP. It does not grant cancellation rights.
ALTER TABLE session_participants ADD COLUMN calendar_token TEXT;
UPDATE session_participants SET calendar_token = lower(hex(randomblob(32)));
CREATE UNIQUE INDEX session_participants_calendar_token_unique ON session_participants(calendar_token);
CREATE TRIGGER session_calendar_token_insert AFTER INSERT ON session_participants
WHEN NEW.calendar_token IS NULL
BEGIN
 UPDATE session_participants SET calendar_token = lower(hex(randomblob(32))) WHERE id = NEW.id;
END;

CREATE TABLE calendar_subscriptions (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE,
 include_waitlist INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
-- Departure permanently invalidates a feed, even if the account later becomes active again.
CREATE TRIGGER calendar_subscription_departure AFTER UPDATE OF status ON users
WHEN NEW.status <> 'active'
BEGIN
 DELETE FROM calendar_subscriptions WHERE user_id = NEW.id;
END;

-- Retain only timing and revision metadata when an RSVP or meeting is deleted.
-- Meeting details are always read through the current session access rules.
CREATE TABLE session_calendar_entries (
 session_id TEXT NOT NULL,
 attendee_id TEXT NOT NULL REFERENCES attendee_identities(id) ON DELETE CASCADE,
 starts_at TEXT,
 timezone TEXT NOT NULL,
 duration_minutes INTEGER,
 sequence INTEGER NOT NULL DEFAULT 0,
 changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
 removed INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY (session_id, attendee_id)
);
CREATE INDEX idx_session_calendar_entries_attendee ON session_calendar_entries(attendee_id);
INSERT INTO session_calendar_entries (session_id, attendee_id, starts_at, timezone, duration_minutes, changed_at)
 SELECT s.id, p.attendee_id, s.starts_at, s.timezone, s.duration_minutes, MAX(s.updated_at, p.updated_at)
 FROM session_participants p JOIN sessions s ON s.id = p.session_id;

CREATE TRIGGER session_calendar_participant_insert AFTER INSERT ON session_participants
BEGIN
INSERT INTO session_calendar_entries (session_id, attendee_id, starts_at, timezone, duration_minutes)
 SELECT s.id, NEW.attendee_id, s.starts_at, s.timezone, s.duration_minutes FROM sessions s WHERE s.id = NEW.session_id
 ON CONFLICT(session_id, attendee_id) DO UPDATE SET
 starts_at = COALESCE(excluded.starts_at, session_calendar_entries.starts_at),
 timezone = excluded.timezone,
 duration_minutes = COALESCE(excluded.duration_minutes, session_calendar_entries.duration_minutes),
 removed = 0, sequence = session_calendar_entries.sequence + 1,
 changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
END;
CREATE TRIGGER session_calendar_participant_update
AFTER UPDATE OF session_id, attendee_id, attendance_status ON session_participants
WHEN OLD.session_id IS NOT NEW.session_id OR OLD.attendee_id IS NOT NEW.attendee_id OR OLD.attendance_status IS NOT NEW.attendance_status
BEGIN
 UPDATE session_calendar_entries SET removed = 1, sequence = sequence + 1,
 changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE session_id = OLD.session_id AND attendee_id = OLD.attendee_id
 AND (OLD.session_id IS NOT NEW.session_id OR OLD.attendee_id IS NOT NEW.attendee_id);
INSERT INTO session_calendar_entries (session_id, attendee_id, starts_at, timezone, duration_minutes)
 SELECT s.id, NEW.attendee_id, s.starts_at, s.timezone, s.duration_minutes FROM sessions s WHERE s.id = NEW.session_id
 ON CONFLICT(session_id, attendee_id) DO UPDATE SET
 starts_at = COALESCE(excluded.starts_at, session_calendar_entries.starts_at),
 timezone = excluded.timezone,
 duration_minutes = COALESCE(excluded.duration_minutes, session_calendar_entries.duration_minutes),
 removed = 0, sequence = session_calendar_entries.sequence + 1,
 changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
END;
CREATE TRIGGER session_calendar_participant_delete AFTER DELETE ON session_participants
BEGIN
 UPDATE session_calendar_entries SET removed = 1, sequence = sequence + 1,
 changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE session_id = OLD.session_id AND attendee_id = OLD.attendee_id;
END;
CREATE TRIGGER session_calendar_session_update
AFTER UPDATE OF slug, title, starts_at, timezone, duration_minutes, theme, theme_title, location_name, status, is_public, astro_path ON sessions
WHEN OLD.slug IS NOT NEW.slug OR OLD.title IS NOT NEW.title OR OLD.starts_at IS NOT NEW.starts_at OR OLD.timezone IS NOT NEW.timezone OR OLD.duration_minutes IS NOT NEW.duration_minutes OR OLD.theme IS NOT NEW.theme OR OLD.theme_title IS NOT NEW.theme_title OR OLD.location_name IS NOT NEW.location_name OR OLD.status IS NOT NEW.status OR OLD.is_public IS NOT NEW.is_public OR OLD.astro_path IS NOT NEW.astro_path
BEGIN
 UPDATE session_calendar_entries SET
 starts_at = COALESCE(NEW.starts_at, starts_at), timezone = NEW.timezone,
 duration_minutes = COALESCE(NEW.duration_minutes, duration_minutes),
 sequence = sequence + 1, changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE session_id = NEW.id;
END;
CREATE TRIGGER session_calendar_session_delete AFTER DELETE ON sessions
BEGIN
 UPDATE session_calendar_entries SET removed = 1, sequence = sequence + 1,
 changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE session_id = OLD.id;
END;
