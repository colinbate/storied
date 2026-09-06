-- Whole-content spoiler flags for discussion openers and replies.

ALTER TABLE threads ADD COLUMN contains_spoilers INTEGER NOT NULL DEFAULT 0
	CHECK (contains_spoilers IN (0, 1));

ALTER TABLE posts ADD COLUMN contains_spoilers INTEGER NOT NULL DEFAULT 0
	CHECK (contains_spoilers IN (0, 1));
