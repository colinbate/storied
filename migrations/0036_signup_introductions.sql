CREATE TABLE signup_introductions (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL
);

CREATE TABLE signup_tickets (
    token_hash TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT,
    timezone TEXT,
    expires_at TEXT NOT NULL
);
