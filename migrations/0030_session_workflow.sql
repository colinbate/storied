-- Migration number: 0030    Session workflow: agenda, attendance, quick notes, recaps, feedback

ALTER TABLE sessions ADD COLUMN live_started_at TEXT;
ALTER TABLE sessions ADD COLUMN live_ended_at TEXT;
ALTER TABLE sessions ADD COLUMN next_theme_note TEXT;
ALTER TABLE sessions ADD COLUMN facilitator_recap TEXT;
ALTER TABLE sessions ADD COLUMN member_recap TEXT;
ALTER TABLE sessions ADD COLUMN member_recap_html TEXT;
ALTER TABLE sessions ADD COLUMN public_recap TEXT;
ALTER TABLE sessions ADD COLUMN public_recap_html TEXT;
ALTER TABLE sessions ADD COLUMN feedback_enabled INTEGER NOT NULL DEFAULT 1;

-- Agenda items belong to one session. Member suggestions start as pending.
CREATE TABLE session_agenda_items (
	id TEXT PRIMARY KEY,
	session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	description TEXT,
	sort_order INTEGER NOT NULL DEFAULT 0,
	visibility TEXT NOT NULL DEFAULT 'members',
	status TEXT NOT NULL DEFAULT 'ready',
	source TEXT NOT NULL DEFAULT 'facilitator',
	submitted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
	completed_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_session_agenda_items_session_order
	ON session_agenda_items(session_id, status, sort_order);

-- The club's single default agenda, copied into each new session.
CREATE TABLE default_agenda_items (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	description TEXT,
	sort_order INTEGER NOT NULL DEFAULT 0,
	visibility TEXT NOT NULL DEFAULT 'members',
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO default_agenda_items (id, title, description, sort_order, visibility) VALUES
	('dagenda_welcome', 'Welcome and announcements', NULL, 0, 'members'),
	('dagenda_roundtable', 'Member roundtable', 'What did everyone read for the theme?', 1, 'members'),
	('dagenda_discussion', 'Discussion items', NULL, 2, 'members'),
	('dagenda_next', 'Confirm next theme and session details', NULL, 3, 'members');

-- What actually happened, separate from RSVP intent.
CREATE TABLE session_attendance (
	id TEXT PRIMARY KEY,
	session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
	attendee_id TEXT NOT NULL REFERENCES attendee_identities(id) ON DELETE CASCADE,
	status TEXT NOT NULL DEFAULT 'present',
	recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	recorded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX session_attendance_session_attendee_unique
	ON session_attendance(session_id, attendee_id);

CREATE INDEX idx_session_attendance_attendee
	ON session_attendance(attendee_id, status);

-- Timestamped facilitator notes taken during a meeting.
CREATE TABLE session_quick_notes (
	id TEXT PRIMARY KEY,
	session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
	body TEXT NOT NULL,
	created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_session_quick_notes_session
	ON session_quick_notes(session_id, created_at);

-- One private feedback response per member per session.
CREATE TABLE session_feedback (
	id TEXT PRIMARY KEY,
	session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	overall_rating INTEGER,
	pace TEXT,
	comments TEXT,
	future_discussion TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX session_feedback_session_user_unique
	ON session_feedback(session_id, user_id);

-- Historical outcomes become attendance records; the RSVP keeps the intent to attend.
INSERT INTO session_attendance (id, session_id, attendee_id, status, recorded_at, recorded_by_user_id, created_at, updated_at)
SELECT
	'att_' || id,
	session_id,
	attendee_id,
	CASE attendance_status WHEN 'attended' THEN 'present' ELSE 'absent' END,
	updated_at,
	NULL,
	updated_at,
	updated_at
FROM session_participants
WHERE attendance_status IN ('attended', 'no_show');

UPDATE session_participants
SET attendance_status = 'attending'
WHERE attendance_status IN ('attended', 'no_show');
