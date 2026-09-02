-- Extensible editorial classifications for books and series.

CREATE TABLE IF NOT EXISTS classifications (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'tag',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_classifications_order_name
  ON classifications(display_order, name);

CREATE TABLE IF NOT EXISTS subject_classifications (
  classification_id INTEGER NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('book', 'series', 'author')),
  subject_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (classification_id, subject_type, subject_id),
  FOREIGN KEY (classification_id) REFERENCES classifications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subject_classifications_subject
  ON subject_classifications(subject_type, subject_id);

INSERT OR IGNORE INTO classifications (id, slug, name, description, icon, display_order)
VALUES
  (1, 'ai-assisted', 'AI-assisted', 'Written by or with the assistance of generative AI.', 'bot', 10),
  (2, 'spicy', 'Spicy', 'Contains notably explicit romantic or sexual content.', 'flame', 20);
