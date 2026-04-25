import { PRIMARY_ORIGIN } from '$shared/brand';
import type { HandlerContext } from '../dispatch';
import { generateId } from '../shared/ids';
import {
	renderDigestEmail,
	sendEmail,
	type DigestFollowedCategory,
	type DigestFollowedThread,
	type DigestThreadPost,
	type DigestFollowedCategoryThread
} from './email';

/** Window size in hours if the user has never received a digest. */
const DEFAULT_WINDOW_HOURS = 24;
/** Maximum window size to bound payload if a user re-enables after a long pause. */
const MAX_WINDOW_HOURS = 48;
/** Preview length (chars) for post bodies embedded in the digest. */
const POST_PREVIEW_CHARS = 200;

interface CandidateUser {
	user_id: string;
	email: string;
	display_name: string;
	timezone: string;
	digest_hour_local: number;
	last_digest_at: string | null;
}

function subtractHours(iso: string, hours: number): string {
	return new Date(Date.parse(iso) - hours * 60 * 60 * 1000).toISOString();
}

function currentLocalHour(nowIso: string, tz: string): number | null {
	try {
		const formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			hour: 'numeric',
			hour12: false
		});
		const value = formatter.format(new Date(nowIso));
		// `en-US` with hour12=false sometimes emits "24" for midnight; normalize.
		const parsed = Number.parseInt(value, 10);
		if (!Number.isFinite(parsed)) return null;
		return ((parsed % 24) + 24) % 24;
	} catch (err) {
		console.error(`[DIGEST] Invalid timezone "${tz}":`, err);
		return null;
	}
}

/**
 * Pull the users who should be processed this run: email_enabled=1,
 * digest_hour_local is set, account is active, and the current local hour
 * in their timezone matches digest_hour_local.
 */
async function selectUsersForThisHour(
	env: HandlerContext['env'],
	nowIso: string
): Promise<CandidateUser[]> {
	const result = await env.DB.prepare(
		`SELECT u.id AS user_id, u.email AS email, u.display_name AS display_name,
		        u.timezone AS timezone, np.digest_hour_local AS digest_hour_local,
		        np.last_digest_at AS last_digest_at
		   FROM users u
		   INNER JOIN notification_preferences np ON np.user_id = u.id
		  WHERE np.email_enabled = 1
		    AND np.digest_hour_local IS NOT NULL
		    AND u.status = 'active'`
	).all<CandidateUser>();

	const candidates = result.results ?? [];

	// Group by timezone so we only compute the local hour per distinct tz.
	const localHourByTz = new Map<string, number | null>();
	for (const c of candidates) {
		if (!localHourByTz.has(c.timezone)) {
			localHourByTz.set(c.timezone, currentLocalHour(nowIso, c.timezone));
		}
	}

	return candidates.filter((c) => {
		const hour = localHourByTz.get(c.timezone);
		return hour !== null && hour === c.digest_hour_local;
	});
}

async function loadFollowedThreadPosts(
	env: HandlerContext['env'],
	userId: string,
	windowStart: string
): Promise<DigestFollowedThread[]> {
	const result = await env.DB.prepare(
		`SELECT t.id AS thread_id, t.slug AS thread_slug, t.title AS thread_title,
		        p.id AS post_id, p.body_source AS body_source, p.created_at AS created_at,
		        u.display_name AS author_display_name
		   FROM posts p
		   INNER JOIN subscriptions s ON s.thread_id = p.thread_id
		                             AND s.user_id = ?
		                             AND s.mode = 'daily_digest'
		   INNER JOIN threads t ON t.id = p.thread_id
		   INNER JOIN users u ON u.id = p.author_user_id
		  WHERE p.created_at >= ?
		    AND p.deleted_at IS NULL
		    AND t.deleted_at IS NULL
		    AND p.author_user_id != ?
		  ORDER BY t.id, p.created_at`
	)
		.bind(userId, windowStart, userId)
		.all<{
			thread_id: string;
			thread_slug: string;
			thread_title: string;
			post_id: string;
			body_source: string;
			created_at: string;
			author_display_name: string;
		}>();

	const rows = result.results ?? [];
	const threadMap = new Map<string, DigestFollowedThread>();
	for (const row of rows) {
		let thread = threadMap.get(row.thread_id);
		if (!thread) {
			thread = {
				threadId: row.thread_id,
				threadSlug: row.thread_slug,
				threadTitle: row.thread_title,
				posts: []
			};
			threadMap.set(row.thread_id, thread);
		}
		const post: DigestThreadPost = {
			authorDisplayName: row.author_display_name,
			bodyPreview: row.body_source.slice(0, POST_PREVIEW_CHARS),
			createdAt: row.created_at
		};
		thread.posts.push(post);
	}
	return [...threadMap.values()];
}

async function loadFollowedCategoryThreads(
	env: HandlerContext['env'],
	userId: string,
	windowStart: string
): Promise<DigestFollowedCategory[]> {
	const result = await env.DB.prepare(
		`SELECT c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
		        t.id AS thread_id, t.slug AS thread_slug, t.title AS thread_title,
		        t.created_at AS created_at,
		        u.display_name AS author_display_name
		   FROM threads t
		   INNER JOIN subscriptions s ON s.category_id = t.category_id
		                             AND s.user_id = ?
		                             AND s.mode = 'daily_digest'
		   INNER JOIN categories c ON c.id = t.category_id
		   INNER JOIN users u ON u.id = t.author_user_id
		  WHERE t.created_at >= ?
		    AND t.deleted_at IS NULL
		    AND t.author_user_id != ?
		  ORDER BY c.sort_order, c.name, t.created_at`
	)
		.bind(userId, windowStart, userId)
		.all<{
			category_id: string;
			category_name: string;
			category_slug: string;
			thread_id: string;
			thread_slug: string;
			thread_title: string;
			created_at: string;
			author_display_name: string;
		}>();

	const rows = result.results ?? [];
	const categoryMap = new Map<string, DigestFollowedCategory>();
	for (const row of rows) {
		let category = categoryMap.get(row.category_id);
		if (!category) {
			category = {
				categoryId: row.category_id,
				categoryName: row.category_name,
				categorySlug: row.category_slug,
				threads: []
			};
			categoryMap.set(row.category_id, category);
		}
		const thread: DigestFollowedCategoryThread = {
			threadId: row.thread_id,
			threadSlug: row.thread_slug,
			threadTitle: row.thread_title,
			authorDisplayName: row.author_display_name,
			createdAt: row.created_at
		};
		category.threads.push(thread);
	}
	return [...categoryMap.values()];
}

async function loadSiteCounts(
	env: HandlerContext['env'],
	userId: string,
	windowStart: string
): Promise<{ newThreads: number; newPosts: number }> {
	const threadsRow = await env.DB.prepare(
		`SELECT COUNT(*) AS n FROM threads
		  WHERE created_at >= ? AND deleted_at IS NULL AND author_user_id != ?`
	)
		.bind(windowStart, userId)
		.first<{ n: number }>();
	const postsRow = await env.DB.prepare(
		`SELECT COUNT(*) AS n FROM posts
		  WHERE created_at >= ? AND deleted_at IS NULL AND author_user_id != ?`
	)
		.bind(windowStart, userId)
		.first<{ n: number }>();

	return {
		newThreads: threadsRow?.n ?? 0,
		newPosts: postsRow?.n ?? 0
	};
}

/**
 * Build and deliver a daily digest for a single user.
 * Called once per selected user in `runDailyDigest`. Returns whether a send
 * was actually attempted (so empty digests are detectable).
 */
async function runDigestForUser(
	env: HandlerContext['env'],
	user: CandidateUser,
	nowIso: string,
	baseUrl: string
): Promise<void> {
	// Determine window start. If never delivered, default to 24h back; if
	// delivered long ago, clamp to MAX_WINDOW_HOURS so the payload stays sane.
	const defaultStart = subtractHours(nowIso, DEFAULT_WINDOW_HOURS);
	const cap = subtractHours(nowIso, MAX_WINDOW_HOURS);
	let windowStart = user.last_digest_at ?? defaultStart;
	if (windowStart < cap) windowStart = cap;

	const [followedThreads, followedCategories, siteCounts] = await Promise.all([
		loadFollowedThreadPosts(env, user.user_id, windowStart),
		loadFollowedCategoryThreads(env, user.user_id, windowStart),
		loadSiteCounts(env, user.user_id, windowStart)
	]);

	const hasContent =
		followedThreads.length > 0 ||
		followedCategories.length > 0 ||
		siteCounts.newThreads > 0 ||
		siteCounts.newPosts > 0;

	if (!hasContent) {
		// No payload → skip send but still advance last_digest_at so the next
		// run only considers newer activity.
		await env.DB.prepare(
			`UPDATE notification_preferences SET last_digest_at = ?, updated_at = ? WHERE user_id = ?`
		)
			.bind(nowIso, nowIso, user.user_id)
			.run();
		return;
	}

	const template = renderDigestEmail({
		displayName: user.display_name,
		windowStart,
		followedThreads,
		followedCategories,
		siteCounts,
		baseUrl
	});

	const send = await sendEmail(env, {
		to: user.email,
		subject: template.subject,
		textBody: template.textBody,
		htmlBody: template.htmlBody
	});

	// Compact summary of what was in this digest, stored for audit.
	const payload = {
		windowStart,
		followedThreadCount: followedThreads.length,
		followedPostCount: followedThreads.reduce((acc, t) => acc + t.posts.length, 0),
		followedCategoryCount: followedCategories.length,
		followedCategoryThreadCount: followedCategories.reduce((acc, c) => acc + c.threads.length, 0),
		siteCounts
	};

	await env.DB.prepare(
		`INSERT INTO notification_events
		   (id, user_id, event_type, payload_json, status, sent_at, failure_reason, created_at, updated_at)
		 VALUES (?, ?, 'digest', ?, ?, ?, ?, ?, ?)`
	)
		.bind(
			generateId(),
			user.user_id,
			JSON.stringify(payload),
			send.success ? 'sent' : 'failed',
			send.success ? nowIso : null,
			send.success ? null : (send.error ?? 'Unknown error'),
			nowIso,
			nowIso
		)
		.run();

	// Always advance last_digest_at — even on send failure we don't want to
	// re-send the same window on the next run. The notification_events row
	// records the failure for follow-up.
	await env.DB.prepare(
		`UPDATE notification_preferences SET last_digest_at = ?, updated_at = ? WHERE user_id = ?`
	)
		.bind(nowIso, nowIso, user.user_id)
		.run();
}

/**
 * Entry point for the hourly digest cron. Selects users whose stored
 * digest_hour_local equals the current hour in their timezone, then
 * processes each in a try/catch so one bad user doesn't kill the batch.
 */
export async function runDailyDigest({ env }: HandlerContext): Promise<void> {
	const now = new Date();
	const nowIso = now.toISOString();

	const users = await selectUsersForThisHour(env, nowIso);
	console.log(`[DIGEST] ${users.length} user(s) eligible at ${nowIso}`);
	if (users.length === 0) return;

	// Derive a base URL for thread links. Prefer an explicitly configured
	// value; fall back to the production hostname.
	const baseUrl = env.DIGEST_BASE_URL?.replace(/\/$/, '') ?? PRIMARY_ORIGIN;

	for (const user of users) {
		try {
			await runDigestForUser(env, user, nowIso, baseUrl);
		} catch (err) {
			console.error(`[DIGEST] Failed for user ${user.user_id}:`, err);
		}
	}
}
