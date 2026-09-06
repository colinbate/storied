-- Migration number: 0028    Session reading choices independent of attendance

CREATE TABLE session_reading_choices (
	session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
	attendee_id TEXT NOT NULL REFERENCES attendee_identities(id) ON DELETE CASCADE,
	book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
	reading_status TEXT NOT NULL DEFAULT 'planned'
		CHECK(reading_status IN ('considering', 'planned', 'reading', 'finished', 'did_not_finish')),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (session_id, attendee_id, book_id)
);

INSERT INTO session_reading_choices (
	session_id,
	attendee_id,
	book_id,
	reading_status,
	created_at,
	updated_at
)
SELECT
	participant.session_id,
	participant.attendee_id,
	choice.subject_id,
	CASE choice.relation_type
		WHEN 'considered' THEN 'considering'
		ELSE 'finished'
	END,
	choice.created_at,
	choice.updated_at
FROM session_participant_subjects AS choice
INNER JOIN session_participants AS participant ON participant.id = choice.participant_id
INNER JOIN books ON books.id = choice.subject_id
WHERE choice.subject_type = 'book';

CREATE INDEX idx_session_reading_choices_session_book
	ON session_reading_choices(session_id, book_id);
CREATE INDEX idx_session_reading_choices_attendee
	ON session_reading_choices(attendee_id, created_at);

DROP TABLE session_participant_subjects;
