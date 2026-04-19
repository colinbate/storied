-- Migration number: 0007 	 2026-04-19
-- Adds an optional 6-digit one-time code and a failed-attempt counter to
-- auth_magic_links, so users can enter a code on a different device instead
-- of clicking the magic link. Consuming either the link or the code sets
-- consumed_at, so they kill each other.

ALTER TABLE auth_magic_links ADD COLUMN code_hash TEXT;
ALTER TABLE auth_magic_links ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
