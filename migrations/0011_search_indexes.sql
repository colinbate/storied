-- Migration number: 0011    Search projection indexes

CREATE VIRTUAL TABLE IF NOT EXISTS subject_search USING fts5(
	subject_type UNINDEXED,
	subject_id UNINDEXED,
	title,
	subtitle,
	authors,
	description,
	identifiers,
	series,
	books,
	genres,
	tokenize = 'unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS thread_search USING fts5(
	thread_id UNINDEXED,
	title,
	body,
	category,
	session,
	subjects,
	authors,
	tokenize = 'unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS session_search USING fts5(
	session_id UNINDEXED,
	title,
	theme,
	body,
	location,
	subjects,
	threads,
	tokenize = 'unicode61'
);
