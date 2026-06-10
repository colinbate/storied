-- Migration number: 0017    Session timezones

ALTER TABLE sessions ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Atlantic/Bermuda';
