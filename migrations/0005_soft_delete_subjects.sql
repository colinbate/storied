-- Migration number: 0005 	 2026-04-17T21:58:00.000Z
-- Adds soft-delete support for books and series.

ALTER TABLE books ADD COLUMN deleted_at TEXT;
ALTER TABLE series ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_books_deleted_at ON books(deleted_at);
CREATE INDEX IF NOT EXISTS idx_series_deleted_at ON series(deleted_at);
