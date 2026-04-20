-- Migration number: 0008 	 2026-04-19T12:00:00.000Z
-- Adds an accessibility preference that swaps all site text to the
-- OpenDyslexic font when enabled. 0 = off (default), 1 = on.

ALTER TABLE users
  ADD COLUMN dyslexic_font INTEGER NOT NULL DEFAULT 0
  CHECK (dyslexic_font IN (0, 1));
