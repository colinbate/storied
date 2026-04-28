-- Migration number: 0012 	 2026-04-28T00:00:00.000Z
-- Add optional Pushover delivery preferences. Initially used for admins.

ALTER TABLE notification_preferences
  ADD COLUMN pushover_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (pushover_enabled IN (0, 1));

ALTER TABLE notification_preferences ADD COLUMN pushover_user_key TEXT;

ALTER TABLE notification_preferences ADD COLUMN pushover_device TEXT;
