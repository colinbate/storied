-- Migration number: 0023    Unified member, guest, and walk-in attendance

ALTER TABLE sessions ADD COLUMN rsvp_capacity INTEGER NOT NULL DEFAULT 12;
ALTER TABLE sessions ADD COLUMN rsvp_waitlist_enabled INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX sessions_rsvp_slug_unique ON sessions(rsvp_slug) WHERE rsvp_slug IS NOT NULL;

CREATE TABLE attendee_identities (
	id TEXT PRIMARY KEY,
	user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
	name TEXT NOT NULL,
	email TEXT,
	email_normalized TEXT,
	legacy_rsvp_person_id INTEGER,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX attendee_identities_user_unique
	ON attendee_identities(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX attendee_identities_email_normalized_unique
	ON attendee_identities(email_normalized) WHERE email_normalized IS NOT NULL;
CREATE UNIQUE INDEX attendee_identities_legacy_rsvp_person_unique
	ON attendee_identities(legacy_rsvp_person_id) WHERE legacy_rsvp_person_id IS NOT NULL;
CREATE INDEX idx_attendee_identities_name ON attendee_identities(name);

INSERT INTO attendee_identities (
	id,
	user_id,
	name,
	email,
	email_normalized,
	created_at,
	updated_at
)
SELECT
	'attendee-user-' || users.id,
	users.id,
	users.display_name,
	users.email,
	lower(trim(users.email)),
	min(session_participants.created_at),
	max(session_participants.updated_at)
FROM session_participants
INNER JOIN users ON users.id = session_participants.user_id
GROUP BY users.id, users.display_name, users.email;

PRAGMA foreign_keys=off;

DROP INDEX IF EXISTS idx_session_participants_user;
DROP INDEX IF EXISTS idx_session_participants_session_status;
DROP INDEX IF EXISTS idx_session_participant_subjects_session_subject;
DROP INDEX IF EXISTS idx_session_participant_subjects_user;

ALTER TABLE session_participants RENAME TO session_participants_old;

CREATE TABLE session_participants (
	id TEXT PRIMARY KEY,
	session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
	attendee_id TEXT NOT NULL REFERENCES attendee_identities(id) ON DELETE CASCADE,
	name_snapshot TEXT NOT NULL,
	email_snapshot TEXT,
	attendance_status TEXT NOT NULL DEFAULT 'attending'
		CHECK(attendance_status IN ('attending', 'waitlisted', 'maybe', 'declined', 'cancelled', 'attended', 'no_show')),
	rsvp_source TEXT CHECK(rsvp_source IN ('member', 'public_form', 'admin', 'legacy_import')),
	confirmation_token TEXT,
	legacy_rsvp_registration_id INTEGER,
	note TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO session_participants (
	id,
	session_id,
	attendee_id,
	name_snapshot,
	email_snapshot,
	attendance_status,
	rsvp_source,
	note,
	created_at,
	updated_at
)
SELECT
	'participant-' || old.session_id || '-' || old.user_id,
	old.session_id,
	'attendee-user-' || old.user_id,
	users.display_name,
	users.email,
	CASE old.attendance_status
		WHEN 'not_attending' THEN 'declined'
		ELSE old.attendance_status
	END,
	old.rsvp_source,
	old.note,
	old.created_at,
	old.updated_at
FROM session_participants_old AS old
INNER JOIN users ON users.id = old.user_id;

CREATE UNIQUE INDEX session_participants_session_attendee_unique
	ON session_participants(session_id, attendee_id);
CREATE UNIQUE INDEX session_participants_confirmation_token_unique
	ON session_participants(confirmation_token) WHERE confirmation_token IS NOT NULL;
CREATE UNIQUE INDEX session_participants_legacy_rsvp_registration_unique
	ON session_participants(legacy_rsvp_registration_id)
	WHERE legacy_rsvp_registration_id IS NOT NULL;
CREATE INDEX idx_session_participants_attendee
	ON session_participants(attendee_id, updated_at);
CREATE INDEX idx_session_participants_session_status
	ON session_participants(session_id, attendance_status, updated_at);

ALTER TABLE session_participant_subjects RENAME TO session_participant_subjects_old;

CREATE TABLE session_participant_subjects (
	participant_id TEXT NOT NULL REFERENCES session_participants(id) ON DELETE CASCADE,
	subject_type TEXT NOT NULL,
	subject_id TEXT NOT NULL,
	relation_type TEXT NOT NULL DEFAULT 'read_for_session',
	is_primary_pick INTEGER NOT NULL DEFAULT 0,
	is_theme_related INTEGER NOT NULL DEFAULT 1,
	note TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (participant_id, subject_type, subject_id)
);

INSERT INTO session_participant_subjects (
	participant_id,
	subject_type,
	subject_id,
	relation_type,
	is_primary_pick,
	is_theme_related,
	note,
	created_at,
	updated_at
)
SELECT
	participant.id,
	old.subject_type,
	old.subject_id,
	old.relation_type,
	old.is_primary_pick,
	old.is_theme_related,
	old.note,
	old.created_at,
	old.updated_at
FROM session_participant_subjects_old AS old
INNER JOIN session_participants AS participant
	ON participant.session_id = old.session_id
INNER JOIN attendee_identities AS attendee
	ON attendee.id = participant.attendee_id
	AND attendee.user_id = old.user_id;

CREATE INDEX idx_session_participant_subjects_session_subject
	ON session_participant_subjects(participant_id, subject_type, subject_id);
CREATE INDEX idx_session_participant_subjects_participant
	ON session_participant_subjects(participant_id, created_at);

DROP TABLE session_participant_subjects_old;
DROP TABLE session_participants_old;

PRAGMA foreign_keys=on;
