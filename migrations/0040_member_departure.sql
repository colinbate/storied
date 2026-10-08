ALTER TABLE users ADD COLUMN left_at TEXT;

-- Departure uses the existing inactive status; the timestamp distinguishes it
-- without rebuilding users and its many retained foreign-key relationships.
CREATE TRIGGER departed_member_status_update BEFORE UPDATE OF status ON users
WHEN OLD.left_at IS NOT NULL AND NEW.left_at IS NOT NULL AND NEW.status <> 'suspended'
BEGIN
	SELECT RAISE(ABORT, 'Departed membership requires explicit reactivation');
END;

-- Prevent an in-flight sign-in from restoring a departed account's session.
CREATE TRIGGER departed_member_session_insert BEFORE INSERT ON user_sessions
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND left_at IS NOT NULL)
BEGIN
	SELECT RAISE(ABORT, 'Departed membership cannot create a session');
END;

-- Public RSVP forms can resolve an existing member identity too.
CREATE TRIGGER departed_member_rsvp_insert BEFORE INSERT ON session_participants
WHEN NEW.attendance_status IN ('attending', 'waitlisted', 'maybe') AND EXISTS (
	SELECT 1 FROM attendee_identities a JOIN users u ON u.id = a.user_id
	WHERE a.id = NEW.attendee_id AND u.left_at IS NOT NULL
)
BEGIN
	SELECT RAISE(ABORT, 'Departed membership cannot register');
END;
CREATE TRIGGER departed_member_rsvp_update BEFORE UPDATE OF attendance_status, attendee_id ON session_participants
WHEN NEW.attendance_status IN ('attending', 'waitlisted', 'maybe') AND EXISTS (
	SELECT 1 FROM attendee_identities a JOIN users u ON u.id = a.user_id
	WHERE a.id = NEW.attendee_id AND u.left_at IS NOT NULL
)
BEGIN
	SELECT RAISE(ABORT, 'Departed membership cannot register');
END;
