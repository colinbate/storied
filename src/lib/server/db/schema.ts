import { integer, sqliteTable, text, uniqueIndex, index, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Helper for ISO-8601 timestamp default.
const timestampDefault = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

// ──────────────────────────────────────────────
// users
// ──────────────────────────────────────────────
export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	displayName: text('display_name').notNull(),
	avatarUrl: text('avatar_url'),
	/** Allowed values: 'member' | 'moderator' | 'admin' */
	role: text('role').notNull().default('member'),
	/** Allowed values: 'active' | 'pending' | 'suspended' */
	status: text('status').notNull().default('active'),
	createdAt: text('created_at').notNull().default(timestampDefault),
	updatedAt: text('updated_at').notNull().default(timestampDefault)
});

// ──────────────────────────────────────────────
// sessions  (book-club sessions, NOT auth sessions)
// ──────────────────────────────────────────────
export const sessions = sqliteTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		slug: text('slug').notNull().unique(),
		title: text('title').notNull(),
		startsAt: text('starts_at'),
		theme: text('theme'),
		astroPath: text('astro_path'),
		externalUrl: text('external_url'),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [index('idx_sessions_slug').on(table.slug)]
);

// ──────────────────────────────────────────────
// categories
// ──────────────────────────────────────────────
export const categories = sqliteTable(
	'categories',
	{
		id: text('id').primaryKey(),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		description: text('description'),
		sortOrder: integer('sort_order').notNull().default(0),
		/** 0 = public, 1 = private */
		isPrivate: integer('is_private').notNull().default(0),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [index('idx_categories_sort_order').on(table.sortOrder, table.name)]
);

// ──────────────────────────────────────────────
// threads
// ──────────────────────────────────────────────
export const threads = sqliteTable(
	'threads',
	{
		id: text('id').primaryKey(),
		categoryId: text('category_id')
			.notNull()
			.references(() => categories.id, { onDelete: 'restrict' }),
		authorUserId: text('author_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'restrict' }),
		sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
		title: text('title').notNull(),
		slug: text('slug').notNull().unique(),
		bodySource: text('body_source').notNull(),
		bodyHtml: text('body_html').notNull(),
		/** Allowed values: 'public' | 'members' | 'admins' */
		visibility: text('visibility').notNull().default('members'),
		/** 0 = unlocked, 1 = locked */
		isLocked: integer('is_locked').notNull().default(0),
		/** 0 = not pinned, 1 = pinned */
		isPinned: integer('is_pinned').notNull().default(0),
		replyCount: integer('reply_count').notNull().default(0),
		lastPostAt: text('last_post_at'),
		deletedAt: text('deleted_at'),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [
		index('idx_threads_category_last_post').on(table.categoryId, table.isPinned, table.lastPostAt),
		index('idx_threads_author').on(table.authorUserId, table.createdAt),
		index('idx_threads_session').on(table.sessionId, table.createdAt),
		index('idx_threads_visibility').on(table.visibility, table.deletedAt, table.lastPostAt)
	]
);

// ──────────────────────────────────────────────
// posts  (replies within a thread)
// ──────────────────────────────────────────────
export const posts = sqliteTable(
	'posts',
	{
		id: text('id').primaryKey(),
		threadId: text('thread_id')
			.notNull()
			.references(() => threads.id, { onDelete: 'cascade' }),
		authorUserId: text('author_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'restrict' }),
		parentPostId: text('parent_post_id'),
		bodySource: text('body_source').notNull(),
		bodyHtml: text('body_html').notNull(),
		editCount: integer('edit_count').notNull().default(0),
		deletedAt: text('deleted_at'),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [
		index('idx_posts_thread_created').on(table.threadId, table.createdAt),
		index('idx_posts_author').on(table.authorUserId, table.createdAt)
	]
);

// ──────────────────────────────────────────────
// subscriptions
// ──────────────────────────────────────────────
export const subscriptions = sqliteTable(
	'subscriptions',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		threadId: text('thread_id').references(() => threads.id, { onDelete: 'cascade' }),
		categoryId: text('category_id').references(() => categories.id, { onDelete: 'cascade' }),
		/** Allowed values: 'immediate' | 'daily_digest' | 'mute' */
		mode: text('mode').notNull(),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [
		uniqueIndex('subscriptions_user_thread_unique').on(table.userId, table.threadId),
		uniqueIndex('subscriptions_user_category_unique').on(table.userId, table.categoryId),
		index('idx_subscriptions_user').on(table.userId)
	]
);

// ──────────────────────────────────────────────
// notification_preferences
// ──────────────────────────────────────────────
export const notificationPreferences = sqliteTable('notification_preferences', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	/** 0 = disabled, 1 = enabled */
	emailEnabled: integer('email_enabled').notNull().default(1),
	/** 0 = disabled, 1 = enabled */
	marketingEnabled: integer('marketing_enabled').notNull().default(0),
	/** Hour 0–23 UTC for digest delivery */
	digestHourUtc: integer('digest_hour_utc'),
	createdAt: text('created_at').notNull().default(timestampDefault),
	updatedAt: text('updated_at').notNull().default(timestampDefault)
});

// ──────────────────────────────────────────────
// notification_events
// ──────────────────────────────────────────────
export const notificationEvents = sqliteTable(
	'notification_events',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** Allowed values: 'reply' | 'mention' | 'new_thread' | 'digest' | 'announcement' */
		eventType: text('event_type').notNull(),
		threadId: text('thread_id').references(() => threads.id, { onDelete: 'cascade' }),
		postId: text('post_id').references(() => posts.id, { onDelete: 'cascade' }),
		payloadJson: text('payload_json'),
		/** Allowed values: 'pending' | 'sent' | 'failed' | 'cancelled' */
		status: text('status').notNull().default('pending'),
		availableAt: text('available_at'),
		sentAt: text('sent_at'),
		failureReason: text('failure_reason'),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [
		index('idx_notification_events_status').on(table.status, table.availableAt, table.createdAt)
	]
);

// ──────────────────────────────────────────────
// moderation_events
// ──────────────────────────────────────────────
export const moderationEvents = sqliteTable(
	'moderation_events',
	{
		id: text('id').primaryKey(),
		actorUserId: text('actor_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'restrict' }),
		/** Allowed values: 'user' | 'thread' | 'post' | 'book' | 'recommendation' */
		targetType: text('target_type').notNull(),
		targetId: text('target_id').notNull(),
		action: text('action').notNull(),
		reason: text('reason'),
		createdAt: text('created_at').notNull().default(timestampDefault)
	},
	(table) => [
		index('idx_moderation_events_target').on(table.targetType, table.targetId, table.createdAt)
	]
);

// ──────────────────────────────────────────────
// auth_magic_links
// ──────────────────────────────────────────────
export const authMagicLinks = sqliteTable(
	'auth_magic_links',
	{
		id: text('id').primaryKey(),
		email: text('email').notNull(),
		tokenHash: text('token_hash').notNull().unique(),
		userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
		expiresAt: text('expires_at').notNull(),
		consumedAt: text('consumed_at'),
		createdAt: text('created_at').notNull().default(timestampDefault)
	},
	(table) => [index('idx_magic_links_email').on(table.email, table.expiresAt)]
);

// ──────────────────────────────────────────────
// invites
// ──────────────────────────────────────────────
export const invites = sqliteTable(
	'invites',
	{
		id: text('id').primaryKey(),
		email: text('email'),
		codeHash: text('code_hash').notNull().unique(),
		createdByUserId: text('created_by_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'restrict' }),
		claimedByUserId: text('claimed_by_user_id').references(() => users.id, {
			onDelete: 'set null'
		}),
		expiresAt: text('expires_at'),
		claimedAt: text('claimed_at'),
		createdAt: text('created_at').notNull().default(timestampDefault)
	},
	(table) => [index('idx_invites_email').on(table.email, table.expiresAt)]
);

// ──────────────────────────────────────────────
// user_sessions  (auth session tokens)
// ──────────────────────────────────────────────
export const userSessions = sqliteTable(
	'user_sessions',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull().unique(),
		expiresAt: text('expires_at').notNull(),
		createdAt: text('created_at').notNull().default(timestampDefault)
	},
	(table) => [
		index('idx_user_sessions_token').on(table.tokenHash),
		index('idx_user_sessions_user').on(table.userId)
	]
);

// ──────────────────────────────────────────────
// books  (canonical book metadata)
// ──────────────────────────────────────────────
export const books = sqliteTable(
	'books',
	{
		id: text('id').primaryKey(),
		slug: text('slug').notNull().unique(),
		title: text('title').notNull(),
		subtitle: text('subtitle'),
		authorText: text('author_text'),
		coverUrl: text('cover_url'),
		isbn13: text('isbn13'),
		openLibraryId: text('open_library_id'),
		googleBooksId: text('google_books_id'),
		amazonAsin: text('amazon_asin'),
		goodreadsUrl: text('goodreads_url'),
		firstPublishYear: integer('first_publish_year'),
		description: text('description'),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [index('idx_books_slug').on(table.slug), index('idx_books_title').on(table.title)]
);

// ──────────────────────────────────────────────
// book_sources  (external source links)
// ──────────────────────────────────────────────
export const bookSources = sqliteTable(
	'book_sources',
	{
		id: text('id').primaryKey(),
		/** Allowed values: 'goodreads' | 'amazon' | 'openlibrary' | 'googlebooks' | 'manual' */
		sourceType: text('source_type').notNull(),
		sourceUrl: text('source_url').notNull(),
		sourceKey: text('source_key').notNull(),
		canonicalBookId: text('canonical_book_id').references(() => books.id, {
			onDelete: 'set null'
		}),
		rawMetadata: text('raw_metadata'),
		/** Allowed values: 'pending' | 'resolved' | 'failed' | 'ignored' */
		fetchStatus: text('fetch_status').notNull().default('pending'),
		lastFetchedAt: text('last_fetched_at'),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [
		unique('book_sources_type_key_unique').on(table.sourceType, table.sourceKey),
		index('idx_book_sources_status').on(table.fetchStatus, table.updatedAt),
		index('idx_book_sources_book').on(table.canonicalBookId)
	]
);

// ──────────────────────────────────────────────
// post_books  (junction between posts/threads and books)
// ──────────────────────────────────────────────
export const postBooks = sqliteTable(
	'post_books',
	{
		id: text('id').primaryKey(),
		postId: text('post_id').references(() => posts.id, { onDelete: 'cascade' }),
		threadId: text('thread_id').references(() => threads.id, { onDelete: 'cascade' }),
		bookId: text('book_id')
			.notNull()
			.references(() => books.id, { onDelete: 'cascade' }),
		bookSourceId: text('book_source_id').references(() => bookSources.id, {
			onDelete: 'set null'
		}),
		displayOrder: integer('display_order').notNull().default(0),
		/** Allowed values: 'linked' | 'mentioned' | 'recommended' */
		context: text('context').notNull().default('linked'),
		createdAt: text('created_at').notNull().default(timestampDefault)
	},
	(table) => [
		index('idx_post_books_thread').on(table.threadId, table.displayOrder),
		index('idx_post_books_post').on(table.postId, table.displayOrder),
		index('idx_post_books_book').on(table.bookId, table.createdAt)
	]
);

// ──────────────────────────────────────────────
// user_books  (personal member relationship to a book)
// ──────────────────────────────────────────────
export const userBooks = sqliteTable(
	'user_books',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		bookId: text('book_id')
			.notNull()
			.references(() => books.id, { onDelete: 'cascade' }),
		readingStatus: text('reading_status').notNull().default('want_to_read'),
		/** 0 = not recommended, 1 = recommended */
		isRecommended: integer('is_recommended').notNull().default(0),
		note: text('note'),
		/** 1–5 star rating */
		rating: integer('rating'),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [
		uniqueIndex('user_books_user_book_unique').on(table.userId, table.bookId),
		index('idx_user_books_user').on(table.userId, table.updatedAt),
		index('idx_user_books_book').on(table.bookId)
	]
);

// ──────────────────────────────────────────────
// session_books  (session-level relationship to a book)
// ──────────────────────────────────────────────
export const sessionBooks = sqliteTable(
	'session_books',
	{
		id: text('id').primaryKey(),
		sessionId: text('session_id')
			.notNull()
			.references(() => sessions.id, { onDelete: 'cascade' }),
		bookId: text('book_id')
			.notNull()
			.references(() => books.id, { onDelete: 'cascade' }),
		status: text('status').notNull().default('mentioned'),
		sourceThreadId: text('source_thread_id').references(() => threads.id, {
			onDelete: 'set null'
		}),
		addedByUserId: text('added_by_user_id').references(() => users.id, {
			onDelete: 'set null'
		}),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [
		uniqueIndex('session_books_session_book_unique').on(table.sessionId, table.bookId),
		index('idx_session_books_session').on(table.sessionId, table.status, table.createdAt),
		index('idx_session_books_book').on(table.bookId)
	]
);
