-- Session creation also creates a primary discussion thread in this reserved category.
INSERT OR IGNORE INTO categories (
	id,
	slug,
	name,
	description,
	sort_order,
	is_private
)
VALUES (
	'cat_session_discussions',
	'session-discussions',
	'Sessions',
	'Automatic discussion threads for book club sessions.',
	60,
	0
);
