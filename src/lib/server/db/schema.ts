import {
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
	index,
	unique,
	primaryKey,
	foreignKey
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Helper for ISO-8601 timestamp default.
const timestampDefault = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
export type SubjectType = 'book' | 'series' | 'author';
export type SessionStatus = 'draft' | 'current' | 'past';
export type SessionThreadRole = 'primary' | 'related';
export type SessionSubjectStatus = 'starter' | 'featured' | 'discussed' | 'mentioned_off_theme';
export type SessionAttendanceStatus = 'attending' | 'not_attending' | 'maybe' | 'attended';
export type SessionParticipantSource = 'member' | 'public_form' | 'admin';
export type SessionParticipantSubjectRelation = 'read_for_session' | 'considered' | 'mentioned';
export type ThemeStatus = 'idea' | 'shortlist' | 'selected' | 'archived';

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
	/** IANA timezone identifier, e.g. 'Atlantic/Bermuda' */
	timezone: text('timezone').notNull().default('Atlantic/Bermuda'),
	/** 0 = default fonts, 1 = use OpenDyslexic for all site text */
	dyslexicFont: integer('dyslexic_font', { mode: 'boolean' }).notNull().default(false),
	createdAt: text('created_at').notNull().default(timestampDefault),
	updatedAt: text('updated_at').notNull().default(timestampDefault)
});

// ──────────────────────────────────────────────
// user_profiles  (club-facing identity)
// ──────────────────────────────────────────────
export const userProfiles = sqliteTable('user_profiles', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	headline: text('headline'),
	bio: text('bio'),
	favoriteGenresText: text('favorite_genres_text'),
	locationText: text('location_text'),
	websiteUrl: text('website_url'),
	showReadBooks: integer('show_read_books', { mode: 'boolean' }).notNull().default(true),
	showRecommendations: integer('show_recommendations', { mode: 'boolean' }).notNull().default(true),
	showProfile: integer('show_profile', { mode: 'boolean' }).notNull().default(true),
	createdAt: text('created_at').notNull().default(timestampDefault),
	updatedAt: text('updated_at').notNull().default(timestampDefault)
});

// ──────────────────────────────────────────────
// themes  (book-club theme library)
// ──────────────────────────────────────────────
export const themes = sqliteTable(
	'themes',
	{
		id: text('id').primaryKey(),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		description: text('description'),
		exampleText: text('example_text'),
		status: text('status').notNull().default('idea').$type<ThemeStatus>(),
		submittedByUserId: text('submitted_by_user_id').references(() => users.id, {
			onDelete: 'set null'
		}),
		selectedAt: text('selected_at'),
		archivedAt: text('archived_at'),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [
		index('idx_themes_status_name').on(table.status, table.name),
		index('idx_themes_submitted_by').on(table.submittedByUserId, table.createdAt),
		index('idx_themes_selected_at').on(table.selectedAt)
	]
);

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
		status: text('status').notNull().default('draft').$type<SessionStatus>(),
		themeId: text('theme_id').references(() => themes.id, { onDelete: 'set null' }),
		theme: text('theme'),
		themeTitle: text('theme_title'),
		themeSummary: text('theme_summary'),
		bodySource: text('body_source'),
		bodyHtml: text('body_html'),
		durationMinutes: integer('duration_minutes'),
		locationName: text('location_name'),
		rsvpSlug: text('rsvp_slug'),
		isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
		astroPath: text('astro_path'),
		externalUrl: text('external_url'),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [
		index('idx_sessions_slug').on(table.slug),
		index('idx_sessions_status_starts_at').on(table.status, table.startsAt),
		index('idx_sessions_is_public_starts_at').on(table.isPublic, table.startsAt),
		index('idx_sessions_theme_id').on(table.themeId)
	]
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
		isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),
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
		sessionThreadRole: text('session_thread_role').$type<SessionThreadRole>(),
		title: text('title').notNull(),
		slug: text('slug').notNull().unique(),
		bodySource: text('body_source').notNull(),
		bodyHtml: text('body_html').notNull(),
		/** Allowed values: 'public' | 'members' | 'admins' */
		visibility: text('visibility').notNull().default('members'),
		/** 0 = unlocked, 1 = locked */
		isLocked: integer('is_locked', { mode: 'boolean' }).notNull().default(false),
		/** 0 = not pinned, 1 = pinned */
		isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
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
		index('idx_threads_session_role').on(table.sessionId, table.sessionThreadRole, table.createdAt),
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
	emailEnabled: integer('email_enabled', { mode: 'boolean' }).notNull().default(true),
	/** 0 = disabled, 1 = enabled */
	marketingEnabled: integer('marketing_enabled', { mode: 'boolean' }).notNull().default(false),
	/** 0 = disabled, 1 = enabled. Initially used for admin notifications. */
	pushoverEnabled: integer('pushover_enabled', { mode: 'boolean' }).notNull().default(false),
	/** Pushover user/group key. */
	pushoverUserKey: text('pushover_user_key'),
	/** Optional Pushover device name. */
	pushoverDevice: text('pushover_device'),
	/** Hour 0–23 in the user's local timezone for digest delivery. NULL = digest disabled. */
	digestHourLocal: integer('digest_hour_local'),
	/** Allowed values: 'immediate' | 'daily_digest'. Applied when auto-subscribing. */
	defaultSubMode: text('default_sub_mode').notNull().default('immediate'),
	/** 0 = do not auto-subscribe on create/reply, 1 = auto-subscribe. */
	autoSubscribeOwn: integer('auto_subscribe_own', { mode: 'boolean' }).notNull().default(true),
	/** ISO-8601 timestamp of the last digest delivery, or NULL if none. */
	lastDigestAt: text('last_digest_at'),
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
		/** Allowed values: 'reply' | 'mention' | 'new_thread' | 'digest' | 'announcement' | 'pending_signup' | 'pushover_test' */
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
		codeHash: text('code_hash'),
		failedAttempts: integer('failed_attempts').notNull().default(0),
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
		deletedAt: text('deleted_at'),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [
		index('idx_books_slug').on(table.slug),
		index('idx_books_title').on(table.title),
		index('idx_books_deleted_at').on(table.deletedAt)
	]
);

// ──────────────────────────────────────────────
// series  (collection of books)
// ──────────────────────────────────────────────
export const series = sqliteTable(
	'series',
	{
		id: text('id').primaryKey(),
		slug: text('slug').notNull().unique(),
		title: text('title').notNull(),
		authorText: text('author_text'),
		description: text('description'),
		coverUrl: text('cover_url'),
		amazonAsin: text('amazon_asin'),
		goodreadsUrl: text('goodreads_url'),
		/** 0 = ongoing, 1 = complete */
		isComplete: integer('is_complete', { mode: 'boolean' }).notNull().default(false),
		bookCount: integer('book_count'),
		deletedAt: text('deleted_at'),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [
		index('idx_series_slug').on(table.slug),
		index('idx_series_title').on(table.title),
		index('idx_series_deleted_at').on(table.deletedAt)
	]
);

// ──────────────────────────────────────────────
// authors  (canonical author metadata)
// ──────────────────────────────────────────────
export const authors = sqliteTable(
	'authors',
	{
		id: text('id').primaryKey(),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		bio: text('bio'),
		photoUrl: text('photo_url'),
		goodreadsUrl: text('goodreads_url'),
		openLibraryId: text('open_library_id'),
		websiteUrl: text('website_url'),
		deletedAt: text('deleted_at'),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [
		index('idx_authors_slug').on(table.slug),
		index('idx_authors_name').on(table.name),
		index('idx_authors_deleted_at').on(table.deletedAt)
	]
);

export const bookAuthors = sqliteTable(
	'book_authors',
	{
		bookId: text('book_id')
			.notNull()
			.references(() => books.id, { onDelete: 'cascade' }),
		authorId: text('author_id')
			.notNull()
			.references(() => authors.id, { onDelete: 'cascade' }),
		displayOrder: integer('display_order').notNull().default(0),
		linkedAt: text('linked_at').notNull().default(timestampDefault)
	},
	(table) => [
		primaryKey({ columns: [table.bookId, table.authorId] }),
		index('idx_book_authors_book').on(table.bookId, table.displayOrder),
		index('idx_book_authors_author').on(table.authorId)
	]
);

export const seriesAuthors = sqliteTable(
	'series_authors',
	{
		seriesId: text('series_id')
			.notNull()
			.references(() => series.id, { onDelete: 'cascade' }),
		authorId: text('author_id')
			.notNull()
			.references(() => authors.id, { onDelete: 'cascade' }),
		displayOrder: integer('display_order').notNull().default(0),
		linkedAt: text('linked_at').notNull().default(timestampDefault)
	},
	(table) => [
		primaryKey({ columns: [table.seriesId, table.authorId] }),
		index('idx_series_authors_series').on(table.seriesId, table.displayOrder),
		index('idx_series_authors_author').on(table.authorId)
	]
);

// ──────────────────────────────────────────────
// subject_sources  (external source links for books, series, or authors)
// ──────────────────────────────────────────────
export const subjectSources = sqliteTable(
	'subject_sources',
	{
		id: text('id').primaryKey(),
		/** Allowed values: 'goodreads' | 'goodreads-series' | 'amazon' | 'openlibrary' | 'googlebooks' | 'manual' */
		sourceType: text('source_type').notNull(),
		sourceUrl: text('source_url').notNull(),
		sourceKey: text('source_key').notNull(),
		/** Allowed values: 'book' | 'series' | 'author' */
		subjectType: text('subject_type').$type<SubjectType>(),
		subjectId: text('subject_id'),
		rawMetadata: text('raw_metadata'),
		/** Allowed values: 'pending' | 'resolved' | 'failed' | 'ignored' */
		fetchStatus: text('fetch_status').notNull().default('pending'),
		lastFetchedAt: text('last_fetched_at'),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [
		unique('subject_sources_type_key_unique').on(table.sourceType, table.sourceKey),
		index('idx_subject_sources_status').on(table.fetchStatus, table.updatedAt),
		index('idx_subject_sources_subject').on(table.subjectType, table.subjectId)
	]
);

// ──────────────────────────────────────────────
// thread_subjects  (junction between threads and subjects)
// ──────────────────────────────────────────────
export const threadSubjects = sqliteTable(
	'thread_subjects',
	{
		id: text('id').primaryKey(),
		threadId: text('thread_id')
			.notNull()
			.references(() => threads.id, { onDelete: 'cascade' }),
		postId: text('post_id').references(() => posts.id, { onDelete: 'set null' }),
		/** Allowed values: 'book' | 'series' | 'author' */
		subjectType: text('subject_type').notNull().$type<SubjectType>(),
		subjectId: text('subject_id').notNull(),
		displayOrder: integer('display_order').notNull().default(0),
		context: text('context').notNull().default('linked').$type<'linked' | 'mentioned' | 'manual'>(),
		createdAt: text('created_at').notNull().default(timestampDefault),
		addedBy: text('added_by').references(() => users.id, { onDelete: 'set null' })
	},
	(table) => [
		unique('thread_subjects_thread_subject_unique').on(
			table.threadId,
			table.subjectType,
			table.subjectId
		),
		index('idx_thread_subjects_thread').on(table.threadId, table.displayOrder),
		index('idx_thread_subjects_subject').on(table.subjectType, table.subjectId, table.createdAt)
	]
);

// ──────────────────────────────────────────────
// genres  (hierarchical genre taxonomy)
// ──────────────────────────────────────────────
export const genres = sqliteTable(
	'genres',
	{
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
		slug: text('slug').notNull().unique(),
		parentId: integer('parent_id'),
		description: text('description'),
		/** 0 = mainstream, 1 = speculative */
		isSpeculative: integer('is_speculative', { mode: 'boolean' }).notNull().default(true),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [index('idx_genres_parent').on(table.parentId, table.name)]
);

// ──────────────────────────────────────────────
// genre_links  (polymorphic genre assignment)
// ──────────────────────────────────────────────
export const genreLinks = sqliteTable(
	'genre_links',
	{
		genreId: integer('genre_id')
			.notNull()
			.references(() => genres.id, { onDelete: 'cascade' }),
		/** Allowed values: 'book' | 'series' | 'author' */
		subjectType: text('subject_type').notNull().$type<SubjectType>(),
		subjectId: text('subject_id').notNull(),
		/** Allowed values: 'manual' | 'inferred' | 'imported' */
		confidence: text('confidence').notNull(),
		linkedAt: text('linked_at').notNull().default(timestampDefault)
	},
	(table) => [
		primaryKey({ columns: [table.genreId, table.subjectType, table.subjectId] }),
		index('idx_genre_links_subject').on(table.subjectType, table.subjectId)
	]
);

// ──────────────────────────────────────────────
// series_books  (ordered books within a series)
// ──────────────────────────────────────────────
export const seriesBooks = sqliteTable(
	'series_books',
	{
		seriesId: text('series_id')
			.notNull()
			.references(() => series.id, { onDelete: 'cascade' }),
		bookId: text('book_id')
			.notNull()
			.references(() => books.id, { onDelete: 'cascade' }),
		positionSort: real('position_sort'),
		position: text('position'),
		linkedAt: text('linked_at').notNull().default(timestampDefault)
	},
	(table) => [
		primaryKey({ columns: [table.seriesId, table.bookId] }),
		index('idx_series_books_series').on(table.seriesId, table.positionSort),
		index('idx_series_books_book').on(table.bookId)
	]
);

// ──────────────────────────────────────────────
// user_subjects  (personal member relationship to a subject)
// ──────────────────────────────────────────────
export const userSubjects = sqliteTable(
	'user_subjects',
	{
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** Allowed values: 'book' | 'series' | 'author' */
		subjectType: text('subject_type').notNull().$type<SubjectType>(),
		subjectId: text('subject_id').notNull(),
		/** Allowed values: 'want_to_read' | 'reading' | 'read' | 'did_not_finish' */
		readingStatus: text('reading_status').notNull().default('want_to_read'),
		/** 0 = not recommended, 1 = recommended */
		isRecommended: integer('is_recommended', { mode: 'boolean' }).notNull().default(false),
		note: text('note'),
		/** 1–5 star rating */
		rating: integer('rating'),
		/** 0 = no spoilers, 1 = note may contain spoilers */
		containsSpoilers: integer('contains_spoilers', { mode: 'boolean' }).notNull().default(false),
		/** 0 = not featured, 1 = feature on club profile */
		featuredOnProfile: integer('featured_on_profile', { mode: 'boolean' }).notNull().default(false),
		featuredOrder: integer('featured_order'),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.subjectType, table.subjectId] }),
		index('idx_user_subjects_user').on(table.userId, table.updatedAt),
		index('idx_user_subjects_subject').on(table.subjectType, table.subjectId)
	]
);

// ──────────────────────────────────────────────
// session_subjects  (session-level relationship to a subject)
// ──────────────────────────────────────────────
export const sessionSubjects = sqliteTable(
	'session_subjects',
	{
		sessionId: text('session_id')
			.notNull()
			.references(() => sessions.id, { onDelete: 'cascade' }),
		/** Allowed values: 'book' | 'series' | 'author' */
		subjectType: text('subject_type').notNull().$type<SubjectType>(),
		subjectId: text('subject_id').notNull(),
		/** Allowed values: 'starter' | 'featured' | 'discussed' | 'mentioned_off_theme' */
		status: text('status').notNull().default('starter').$type<SessionSubjectStatus>(),
		note: text('note'),
		addedByUserId: text('added_by_user_id').references(() => users.id, {
			onDelete: 'set null'
		}),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [
		primaryKey({ columns: [table.sessionId, table.subjectType, table.subjectId] }),
		index('idx_session_subjects_session').on(table.sessionId, table.status, table.createdAt),
		index('idx_session_subjects_subject').on(table.subjectType, table.subjectId)
	]
);

// ──────────────────────────────────────────────
// session_participants  (member relationship to a session)
// ──────────────────────────────────────────────
export const sessionParticipants = sqliteTable(
	'session_participants',
	{
		sessionId: text('session_id')
			.notNull()
			.references(() => sessions.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		attendanceStatus: text('attendance_status')
			.notNull()
			.default('attending')
			.$type<SessionAttendanceStatus>(),
		rsvpSource: text('rsvp_source').$type<SessionParticipantSource>(),
		note: text('note'),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [
		primaryKey({ columns: [table.sessionId, table.userId] }),
		index('idx_session_participants_user').on(table.userId, table.updatedAt),
		index('idx_session_participants_session_status').on(
			table.sessionId,
			table.attendanceStatus,
			table.updatedAt
		)
	]
);

export const sessionParticipantSubjects = sqliteTable(
	'session_participant_subjects',
	{
		sessionId: text('session_id').notNull(),
		userId: text('user_id').notNull(),
		subjectType: text('subject_type').notNull().$type<Extract<SubjectType, 'book' | 'series'>>(),
		subjectId: text('subject_id').notNull(),
		relationType: text('relation_type')
			.notNull()
			.default('read_for_session')
			.$type<SessionParticipantSubjectRelation>(),
		isPrimaryPick: integer('is_primary_pick', { mode: 'boolean' }).notNull().default(false),
		isThemeRelated: integer('is_theme_related', { mode: 'boolean' }).notNull().default(true),
		note: text('note'),
		createdAt: text('created_at').notNull().default(timestampDefault),
		updatedAt: text('updated_at').notNull().default(timestampDefault)
	},
	(table) => [
		primaryKey({ columns: [table.sessionId, table.userId, table.subjectType, table.subjectId] }),
		foreignKey({
			columns: [table.sessionId, table.userId],
			foreignColumns: [sessionParticipants.sessionId, sessionParticipants.userId]
		}).onDelete('cascade'),
		index('idx_session_participant_subjects_session_subject').on(
			table.sessionId,
			table.subjectType,
			table.subjectId
		),
		index('idx_session_participant_subjects_user').on(table.userId, table.createdAt)
	]
);
