import { PRIMARY_ORIGIN } from '$shared/brand';
import type { HandlerContext } from '../dispatch';
import { spoilerSafeExcerpt } from '$shared/spoilers';
import { loadPersonalDigestActivity } from './digest-personal-activity';
import {
	renderDigestEmail,
	sendEmail,
	type DigestFollowedCategory,
	type DigestFollowedThread,
	type DigestSiteActivityItem,
	type DigestThreadPost,
	type DigestFollowedCategoryThread
} from './email';

/** Window size in hours if the user has never received a digest. */
const DEFAULT_WINDOW_HOURS = 24;
/** Maximum window size to bound payload if a user re-enables after a long pause. */
const MAX_WINDOW_HOURS = 48;
/** Preview length (chars) for post bodies embedded in the digest. */
const POST_PREVIEW_CHARS = 200;
/** Maximum number of forum-wide activity items shown in a digest. */
const SITE_ACTIVITY_LIMIT = 10;

// Moderators may open any group thread, but group notifications remain limited
// to actual group members so moderation access does not create extra noise.
const DIGEST_THREAD_ACCESS_SQL = `
 AND NOT EXISTS (SELECT 1 FROM sessions se WHERE se.id = t.session_id AND se.status = 'draft')
	AND (
		t.visibility <> 'admins'
		OR EXISTS (
			SELECT 1 FROM users access_user
			WHERE access_user.id = ? AND access_user.role IN ('admin', 'moderator')
		)
	)
	AND (
		t.audience_group_id IS NULL
		OR EXISTS (
			SELECT 1 FROM group_memberships access_membership
			WHERE access_membership.group_id = t.audience_group_id
				AND access_membership.user_id = ?
		)
	)`;

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
		        p.id AS post_id, p.body_source AS body_source, p.contains_spoilers AS contains_spoilers, p.created_at AS created_at,
		        u.display_name AS author_display_name
		   FROM posts p
		   INNER JOIN subscriptions s ON s.thread_id = p.thread_id
		                             AND s.user_id = ?
		                             AND s.mode = 'daily_digest'
		   INNER JOIN threads t ON t.id = p.thread_id
		   INNER JOIN users u ON u.id = p.author_user_id
		   LEFT JOIN thread_read_states read_state ON read_state.user_id = ?
		                                           AND read_state.thread_id = p.thread_id
		  WHERE p.created_at >= ?
		    AND p.deleted_at IS NULL
		    AND t.deleted_at IS NULL
		    AND p.author_user_id != ?
		    AND (
		    	read_state.user_id IS NULL
		    	OR p.created_at > read_state.last_read_post_created_at
		    	OR (
		    		p.created_at = read_state.last_read_post_created_at
		    		AND p.id > COALESCE(read_state.last_read_post_id, '')
		    	)
		    )
		    AND NOT EXISTS (
		    	SELECT 1 FROM posts own_post
		    	WHERE own_post.thread_id = p.thread_id
		    	  AND own_post.author_user_id = ?
		    	  AND (
		    		own_post.created_at > p.created_at
		    		OR (own_post.created_at = p.created_at AND own_post.id > p.id)
		    	  )
		    )
		    ${DIGEST_THREAD_ACCESS_SQL}
		  ORDER BY t.id, p.created_at, p.id`
	)
		.bind(userId, userId, windowStart, userId, userId, userId, userId)
		.all<{
			thread_id: string;
			thread_slug: string;
			thread_title: string;
			post_id: string;
			body_source: string;
			contains_spoilers: number;
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
			bodyPreview:
				spoilerSafeExcerpt(row.body_source, {
					containsSpoilers: Boolean(row.contains_spoilers),
					maxLength: POST_PREVIEW_CHARS
				}) ?? '',
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
		   LEFT JOIN thread_read_states read_state ON read_state.user_id = ?
		                                           AND read_state.thread_id = t.id
		  WHERE t.created_at >= ?
		    AND t.deleted_at IS NULL
		    AND t.author_user_id != ?
		    AND read_state.user_id IS NULL
		    AND NOT EXISTS (
		    	SELECT 1 FROM posts own_post
		    	WHERE own_post.thread_id = t.id
		    	  AND own_post.author_user_id = ?
		    )
		    ${DIGEST_THREAD_ACCESS_SQL}
		  ORDER BY c.sort_order, c.name, t.created_at`
	)
		.bind(userId, userId, windowStart, userId, userId, userId, userId)
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
): Promise<{
	counts: { newThreads: number; newPosts: number };
	activity: DigestSiteActivityItem[];
}> {
	const threadsCountQuery = env.DB.prepare(
		`SELECT COUNT(*) AS n
		   FROM threads t
		   LEFT JOIN thread_read_states read_state ON read_state.user_id = ?
		                                           AND read_state.thread_id = t.id
		  WHERE t.created_at >= ? AND t.deleted_at IS NULL AND t.author_user_id != ?
		    AND read_state.user_id IS NULL
		    AND NOT EXISTS (
		    	SELECT 1 FROM subscriptions digest_subscription
		    	WHERE digest_subscription.user_id = ?
		    	  AND digest_subscription.category_id = t.category_id
		    	  AND digest_subscription.mode = 'daily_digest'
		    )
		    AND NOT EXISTS (
		    	SELECT 1 FROM posts own_post
		    	WHERE own_post.thread_id = t.id
		    	  AND own_post.author_user_id = ?
		    )
		  ${DIGEST_THREAD_ACCESS_SQL}`
	)
		.bind(userId, windowStart, userId, userId, userId, userId, userId)
		.first<{ n: number }>();
	const postsCountQuery = env.DB.prepare(
		`SELECT COUNT(*) AS n
		 FROM posts p
		 INNER JOIN threads t ON t.id = p.thread_id
		 LEFT JOIN thread_read_states read_state ON read_state.user_id = ?
		                                         AND read_state.thread_id = p.thread_id
		 WHERE p.created_at >= ?
		   AND p.deleted_at IS NULL
		   AND t.deleted_at IS NULL
		   AND p.author_user_id != ?
		   AND (
		   	read_state.user_id IS NULL
		   	OR p.created_at > read_state.last_read_post_created_at
		   	OR (
		   		p.created_at = read_state.last_read_post_created_at
		   		AND p.id > COALESCE(read_state.last_read_post_id, '')
		   	)
		   )
		   AND NOT EXISTS (
		   	SELECT 1 FROM subscriptions digest_subscription
		   	WHERE digest_subscription.user_id = ?
		   	  AND digest_subscription.thread_id = p.thread_id
		   	  AND digest_subscription.mode = 'daily_digest'
		   )
		   AND NOT EXISTS (
		   	SELECT 1 FROM posts own_post
		   	WHERE own_post.thread_id = p.thread_id
		   	  AND own_post.author_user_id = ?
		   	  AND (
		   		own_post.created_at > p.created_at
		   		OR (own_post.created_at = p.created_at AND own_post.id > p.id)
		   	  )
		   )
		   ${DIGEST_THREAD_ACCESS_SQL}`
	)
		.bind(userId, windowStart, userId, userId, userId, userId, userId)
		.first<{ n: number }>();
	const threadsQuery = env.DB.prepare(
		`SELECT t.slug AS thread_slug, t.title AS thread_title, t.created_at AS created_at,
		        c.name AS category_name, u.display_name AS author_display_name
		   FROM threads t
		   INNER JOIN categories c ON c.id = t.category_id
		   INNER JOIN users u ON u.id = t.author_user_id
		   LEFT JOIN thread_read_states read_state ON read_state.user_id = ?
		                                           AND read_state.thread_id = t.id
		  WHERE t.created_at >= ?
		    AND t.deleted_at IS NULL
		    AND t.author_user_id != ?
		    AND read_state.user_id IS NULL
		    AND NOT EXISTS (
		    	SELECT 1 FROM subscriptions digest_subscription
		    	WHERE digest_subscription.user_id = ?
		    	  AND digest_subscription.category_id = t.category_id
		    	  AND digest_subscription.mode = 'daily_digest'
		    )
		    AND NOT EXISTS (
		    	SELECT 1 FROM posts own_post
		    	WHERE own_post.thread_id = t.id
		    	  AND own_post.author_user_id = ?
		    )
		    ${DIGEST_THREAD_ACCESS_SQL}
		  ORDER BY t.created_at DESC, t.id DESC
		  LIMIT ?`
	)
		.bind(userId, windowStart, userId, userId, userId, userId, userId, SITE_ACTIVITY_LIMIT)
		.all<{
			thread_slug: string;
			thread_title: string;
			created_at: string;
			category_name: string;
			author_display_name: string;
		}>();
	const postsQuery = env.DB.prepare(
		`SELECT p.id AS post_id, p.body_source AS body_source,
		        p.contains_spoilers AS contains_spoilers, p.created_at AS created_at,
		        t.slug AS thread_slug, t.title AS thread_title,
		        u.display_name AS author_display_name
		   FROM posts p
		   INNER JOIN threads t ON t.id = p.thread_id
		   INNER JOIN users u ON u.id = p.author_user_id
		   LEFT JOIN thread_read_states read_state ON read_state.user_id = ?
		                                           AND read_state.thread_id = p.thread_id
		  WHERE p.created_at >= ?
		    AND p.deleted_at IS NULL
		    AND t.deleted_at IS NULL
		    AND p.author_user_id != ?
		    AND (
		    	read_state.user_id IS NULL
		    	OR p.created_at > read_state.last_read_post_created_at
		    	OR (
		    		p.created_at = read_state.last_read_post_created_at
		    		AND p.id > COALESCE(read_state.last_read_post_id, '')
		    	)
		    )
		    AND NOT EXISTS (
		    	SELECT 1 FROM subscriptions digest_subscription
		    	WHERE digest_subscription.user_id = ?
		    	  AND digest_subscription.thread_id = p.thread_id
		    	  AND digest_subscription.mode = 'daily_digest'
		    )
		    AND NOT EXISTS (
		    	SELECT 1 FROM posts own_post
		    	WHERE own_post.thread_id = p.thread_id
		    	  AND own_post.author_user_id = ?
		    	  AND (
		    		own_post.created_at > p.created_at
		    		OR (own_post.created_at = p.created_at AND own_post.id > p.id)
		    	  )
		    )
		    ${DIGEST_THREAD_ACCESS_SQL}
		  ORDER BY p.created_at DESC, p.id DESC
		  LIMIT ?`
	)
		.bind(userId, windowStart, userId, userId, userId, userId, userId, SITE_ACTIVITY_LIMIT)
		.all<{
			post_id: string;
			body_source: string;
			contains_spoilers: number;
			created_at: string;
			thread_slug: string;
			thread_title: string;
			author_display_name: string;
		}>();

	const [threadsRow, postsRow, threadsResult, postsResult] = await Promise.all([
		threadsCountQuery,
		postsCountQuery,
		threadsQuery,
		postsQuery
	]);
	const threadActivity: DigestSiteActivityItem[] = (threadsResult.results ?? []).map((row) => ({
		kind: 'thread',
		threadSlug: row.thread_slug,
		threadTitle: row.thread_title,
		categoryName: row.category_name,
		authorDisplayName: row.author_display_name,
		createdAt: row.created_at
	}));
	const postActivity: DigestSiteActivityItem[] = (postsResult.results ?? []).map((row) => ({
		kind: 'post',
		postId: row.post_id,
		threadSlug: row.thread_slug,
		threadTitle: row.thread_title,
		authorDisplayName: row.author_display_name,
		bodyPreview:
			spoilerSafeExcerpt(row.body_source, {
				containsSpoilers: Boolean(row.contains_spoilers),
				maxLength: POST_PREVIEW_CHARS
			}) ?? '',
		createdAt: row.created_at
	}));
	const activity = [...threadActivity, ...postActivity]
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		.slice(0, SITE_ACTIVITY_LIMIT);

	return {
		counts: {
			newThreads: threadsRow?.n ?? 0,
			newPosts: postsRow?.n ?? 0
		},
		activity
	};
}

export async function loadDigestContent(
	env: HandlerContext['env'],
	userId: string,
	windowStart: string
): Promise<{
	followedThreads: DigestFollowedThread[];
	followedCategories: DigestFollowedCategory[];
	siteCounts: { newThreads: number; newPosts: number };
	siteActivity: DigestSiteActivityItem[];
}> {
	const [followedThreads, followedCategories, site] = await Promise.all([
		loadFollowedThreadPosts(env, userId, windowStart),
		loadFollowedCategoryThreads(env, userId, windowStart),
		loadSiteCounts(env, userId, windowStart)
	]);

	return {
		followedThreads,
		followedCategories,
		siteCounts: site.counts,
		siteActivity: site.activity
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
	// A daily claim prevents overlapping cron deliveries. Failed sends can retry;
	// interrupted claims become available after ten minutes.
	const localDay = new Intl.DateTimeFormat('en-CA', {
		timeZone: user.timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date(nowIso));
	const digestId = `digest:${user.user_id}:${localDay}`;
	await env.DB.prepare(
		`INSERT INTO notification_events
		(id, user_id, event_type, status, created_at, updated_at)
		VALUES (?, ?, 'digest', 'pending', ?, ?) ON CONFLICT DO NOTHING`
	)
		.bind(digestId, user.user_id, nowIso, nowIso)
		.run();
	const claim = await env.DB.prepare(
		`UPDATE notification_events
		SET status = 'pending', available_at = ?, updated_at = ?
		WHERE id = ? AND (status = 'failed' OR
			(status = 'pending' AND (available_at IS NULL OR available_at <= ?)))
		RETURNING id`
	)
		.bind(new Date(Date.parse(nowIso) + 10 * 60_000).toISOString(), nowIso, digestId, nowIso)
		.first();
	if (!claim) return;
	try {
		const cap = subtractHours(nowIso, MAX_WINDOW_HOURS);
		const windowStart =
			(user.last_digest_at ?? subtractHours(nowIso, DEFAULT_WINDOW_HOURS)) < cap
				? cap
				: (user.last_digest_at ?? subtractHours(nowIso, DEFAULT_WINDOW_HOURS));
		const { followedThreads, followedCategories, siteCounts, siteActivity } =
			await loadDigestContent(env, user.user_id, windowStart);
		const { activity: personalActivity, eventIds } = await loadPersonalDigestActivity(
			env,
			user.user_id,
			nowIso
		);
		// Preferences may change while this cron run is preparing other members' digests.
		const current = await env.DB.prepare(
			`SELECT u.email FROM users u
			JOIN notification_preferences np ON np.user_id = u.id
			WHERE u.id = ? AND u.status = 'active' AND np.email_enabled = 1
			AND np.digest_hour_local = ?`
		)
			.bind(user.user_id, user.digest_hour_local)
			.first<{ email: string }>();
		if (!current) {
			await env.DB.prepare(
				"UPDATE notification_events SET status = 'cancelled', updated_at = ? WHERE id = ?"
			)
				.bind(nowIso, digestId)
				.run();
			return;
		}
		const hasContent =
			followedThreads.length > 0 ||
			followedCategories.length > 0 ||
			siteCounts.newThreads > 0 ||
			siteCounts.newPosts > 0 ||
			personalActivity.length > 0;
		const payload = {
			windowStart,
			followedThreadCount: followedThreads.length,
			followedPostCount: followedThreads.reduce((acc, t) => acc + t.posts.length, 0),
			followedCategoryCount: followedCategories.length,
			siteCounts,
			personalActivityCount: personalActivity.length,
			personalEventIds: eventIds
		};
		let sentAt: string | null = null;
		if (hasContent) {
			const template = renderDigestEmail({
				displayName: user.display_name,
				windowStart,
				followedThreads,
				followedCategories,
				siteCounts,
				siteActivity,
				personalActivity,
				baseUrl
			});
			const send = await sendEmail(env, { to: current.email, ...template });
			if (!send.success) throw new Error(send.error ?? 'Digest email could not be sent');
			sentAt = nowIso;
		}
		await env.DB.batch([
			env.DB.prepare(
				`UPDATE notification_events SET status = ?, sent_at = ?, payload_json = ?,
				failure_reason = NULL, updated_at = ? WHERE id = ?`
			).bind(hasContent ? 'sent' : 'cancelled', sentAt, JSON.stringify(payload), nowIso, digestId),
			env.DB.prepare(
				`UPDATE notification_events SET status = ?, sent_at = ?, updated_at = ?
				WHERE id IN (SELECT value FROM json_each(?)) AND status = 'pending'`
			).bind(hasContent ? 'sent' : 'cancelled', sentAt, nowIso, JSON.stringify(eventIds)),
			env.DB.prepare(
				`UPDATE notification_preferences SET last_digest_at = ?, updated_at = ? WHERE user_id = ?`
			).bind(nowIso, nowIso, user.user_id)
		]);
	} catch (err) {
		await env.DB.prepare(
			`UPDATE notification_events SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?`
		)
			.bind(err instanceof Error ? err.message : 'Unknown error', nowIso, digestId)
			.run();
		// Leave the window and deferred events untouched so the next run can retry.
		throw err;
	}
}

/**
 * Entry point for the hourly digest cron. Selects users whose stored
 * digest_hour_local equals the current hour in their timezone, then
 * processes each in a try/catch so one bad user doesn't kill the batch.
 */
export async function runDailyDigest({ env }: HandlerContext, now = new Date()): Promise<void> {
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
