-- Library context: edition details and manually maintained access options.

ALTER TABLE books ADD COLUMN edition_label TEXT;
ALTER TABLE books ADD COLUMN language TEXT;
ALTER TABLE books ADD COLUMN page_count INTEGER;
ALTER TABLE books ADD COLUMN audiobook_minutes INTEGER;

CREATE TABLE book_access_options (
	id TEXT PRIMARY KEY,
	book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
	provider_name TEXT NOT NULL,
	provider_type TEXT NOT NULL DEFAULT 'library',
	format TEXT NOT NULL DEFAULT 'print',
	url TEXT,
	note TEXT,
	created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_book_access_options_book
	ON book_access_options(book_id, provider_name, format);
