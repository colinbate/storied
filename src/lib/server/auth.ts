import { nanoid } from 'nanoid';
import { eq, and, gt, gte, isNull, sql, or } from 'drizzle-orm';
import type { ORM } from './db';
import {
	users,
	authMagicLinks,
	userSessions,
	notificationPreferences,
	invites,
	subscriptions
} from './db/schema';
import { error, redirect, type Cookies, type RequestEvent } from '@sveltejs/kit';
import { isValidTimezone } from './notification-preferences';
import { ANNOUNCEMENTS_CATEGORY_ID } from './discussions';
import { sendMagicLinkEmail } from './email';

const REDIR_COOKIE_NAME = 'storied-redirect';
const SESSION_COOKIE_NAME = 'storied_session';
const TIMEZONE_COOKIE_NAME = 'storied-signup-tz';
const INVITE_COOKIE_NAME = 'storied-invite';
const SIGNUP_NAME_COOKIE_NAME = 'storied-signup-name';
const TIMEZONE_COOKIE_MAX_AGE_S = 60 * 60; // 1 hour — only needs to outlive the magic-link round-trip
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAGIC_LINK_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CODE_ATTEMPTS = 5;

export {
	SESSION_COOKIE_NAME,
	REDIR_COOKIE_NAME,
	TIMEZONE_COOKIE_NAME,
	TIMEZONE_COOKIE_MAX_AGE_S,
	INVITE_COOKIE_NAME,
	SIGNUP_NAME_COOKIE_NAME
};

/** Hash a token using Web Crypto (available in CF Workers) */
export async function hashToken(token: string): Promise<string> {
	const encoded = new TextEncoder().encode(token);
	const digest = await crypto.subtle.digest('SHA-256', encoded);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/** Generate a uniformly-random 6-digit numeric code. */
function generateOneTimeCode(): string {
	// 2**32 is not a multiple of 1_000_000, so taking mod introduces a tiny
	// modulo bias (≈2.4e-4). Acceptable for 6-digit codes used once.
	const buf = new Uint32Array(1);
	crypto.getRandomValues(buf);
	return (buf[0] % 1_000_000).toString().padStart(6, '0');
}

/** Create a magic link token + one-time code for the given email. */
export async function createMagicLink(
	db: ORM,
	email: string
): Promise<{ token: string; code: string; id: string }> {
	const token = nanoid(48);
	const tokenHash = await hashToken(token);
	const code = generateOneTimeCode();
	const codeHash = await hashToken(code);
	const id = nanoid();
	const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS).toISOString();

	// Look up existing user
	const existingUser = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email.toLowerCase()))
		.get();

	await db.insert(authMagicLinks).values({
		id,
		email: email.toLowerCase(),
		tokenHash,
		codeHash,
		userId: existingUser?.id ?? null,
		expiresAt
	});

	return { token, code, id };
}

/** Verify a magic link token. Returns the email and user (if exists), and consumes the link. */
export async function verifyMagicLink(
	db: ORM,
	token: string
): Promise<{ email: string; userId: string | null } | null> {
	const tokenHash = await hashToken(token);
	const now = new Date().toISOString();

	const link = await db
		.select()
		.from(authMagicLinks)
		.where(
			and(
				eq(authMagicLinks.tokenHash, tokenHash),
				gt(authMagicLinks.expiresAt, now),
				isNull(authMagicLinks.consumedAt)
			)
		)
		.get();

	if (!link) return null;

	// Consume the link
	await db.update(authMagicLinks).set({ consumedAt: now }).where(eq(authMagicLinks.id, link.id));

	return { email: link.email, userId: link.userId };
}

/**
 * Verify a 6-digit one-time code for an email.
 *
 * Matches the unconsumed, unexpired link whose code_hash matches. On a miss,
 * increments failed_attempts on every still-live link for that email; once
 * any reaches MAX_CODE_ATTEMPTS, consumes all live links for the email so the
 * code space cannot be brute-forced within the 15-minute window.
 */
export async function verifyMagicLinkCode(
	db: ORM,
	email: string,
	code: string
): Promise<{ email: string; userId: string | null } | { error: 'invalid' | 'locked' | 'expired' }> {
	const normalizedEmail = email.toLowerCase();
	const codeHash = await hashToken(code);
	const now = new Date().toISOString();

	const link = await db
		.select()
		.from(authMagicLinks)
		.where(
			and(
				eq(authMagicLinks.email, normalizedEmail),
				eq(authMagicLinks.codeHash, codeHash),
				gt(authMagicLinks.expiresAt, now),
				isNull(authMagicLinks.consumedAt)
			)
		)
		.get();

	if (link) {
		await db.update(authMagicLinks).set({ consumedAt: now }).where(eq(authMagicLinks.id, link.id));
		return { email: link.email, userId: link.userId };
	}

	// Miss — increment failed attempts on all currently-live links for this
	// email and lock them out if we've hit the threshold.
	await db
		.update(authMagicLinks)
		.set({ failedAttempts: sql`${authMagicLinks.failedAttempts} + 1` })
		.where(
			and(
				eq(authMagicLinks.email, normalizedEmail),
				gt(authMagicLinks.expiresAt, now),
				isNull(authMagicLinks.consumedAt)
			)
		);

	const locked = await db
		.update(authMagicLinks)
		.set({ consumedAt: now })
		.where(
			and(
				eq(authMagicLinks.email, normalizedEmail),
				gte(authMagicLinks.failedAttempts, MAX_CODE_ATTEMPTS),
				isNull(authMagicLinks.consumedAt)
			)
		)
		.returning({ id: authMagicLinks.id })
		.get();

	if (locked) {
		return { error: 'locked' };
	}

	return { error: 'invalid' };
}

/** Create or find a user by email. If new, creates with 'active' status and the email as display name. */
export type UserRole = 'member' | 'moderator' | 'admin';
export type UserStatus = 'active' | 'pending' | 'suspended';
export type SignupMode = 'closed' | 'moderated' | 'open';

export const USER_ROLES: UserRole[] = ['member', 'moderator', 'admin'];
export const USER_STATUSES: UserStatus[] = ['active', 'pending', 'suspended'];

export function isUserRole(value: unknown): value is UserRole {
	return typeof value === 'string' && (USER_ROLES as string[]).includes(value);
}

export function isUserStatus(value: unknown): value is UserStatus {
	return typeof value === 'string' && (USER_STATUSES as string[]).includes(value);
}

export function getSignupMode(value: string | undefined): SignupMode {
	if (value === 'yes' || value === 'open') return 'open';
	if (value === 'moderated') return 'moderated';
	return 'closed';
}

export interface FindOrCreateUserOptions {
	role?: UserRole;
	allowSignup?: boolean;
	status?: UserStatus;
	/** IANA timezone identifier used when creating a brand-new user. */
	timezone?: string;
	name?: string;
}

export interface StartMagicLinkLoginOptions {
	db: ORM;
	platform: App.Platform | undefined;
	cookies: Cookies;
	origin: string;
	email: string;
	inviteCode?: string;
	displayName?: string | null;
	browserTimezone?: string | null;
}

export async function findOrCreateUser(
	db: ORM,
	email: string,
	opts?: FindOrCreateUserOptions
): Promise<{ id: string; isNew: boolean }> {
	const role: UserRole = opts?.role ?? 'member';
	const signupAllowed = opts?.allowSignup ?? true;
	const status: UserStatus = opts?.status ?? 'active';
	const name = opts?.name;

	const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
	if (existing) return { id: existing.id, isNew: false };
	if (!signupAllowed) return { id: '', isNew: false };
	const id = nanoid();
	const displayName = name ?? email.split('@')[0];
	const insertValues: typeof users.$inferInsert = {
		id,
		email: email.toLowerCase(),
		displayName,
		role,
		status
	};
	if (opts?.timezone) insertValues.timezone = opts.timezone;
	await db.insert(users).values(insertValues);

	// Seed a notification_preferences row for the new user. The migration
	// backfills existing users; this handles new ones.
	await db.insert(notificationPreferences).values({ userId: id }).onConflictDoNothing();
	await db
		.insert(subscriptions)
		.values({
			id: nanoid(),
			userId: id,
			categoryId: ANNOUNCEMENTS_CATEGORY_ID,
			mode: 'immediate'
		})
		.onConflictDoNothing();

	return { id, isNew: true };
}

export async function getValidInviteForEmail(db: ORM, code: string, email: string) {
	const codeHash = await hashToken(code);
	const normalizedEmail = email.toLowerCase();
	const now = new Date().toISOString();

	return await db
		.select()
		.from(invites)
		.where(
			and(
				eq(invites.codeHash, codeHash),
				isNull(invites.claimedAt),
				or(isNull(invites.expiresAt), gt(invites.expiresAt, now)),
				or(isNull(invites.email), eq(invites.email, normalizedEmail))
			)
		)
		.get();
}

export async function claimInvite(db: ORM, inviteId: string, userId: string): Promise<void> {
	const now = new Date().toISOString();
	await db
		.update(invites)
		.set({ claimedByUserId: userId, claimedAt: now })
		.where(eq(invites.id, inviteId));
}

export async function startMagicLinkLogin(
	opts: StartMagicLinkLoginOptions
): Promise<{ ok: true; email: string } | { ok: false; error: string; email: string }> {
	const { db, platform, cookies, origin, email, inviteCode, displayName, browserTimezone } = opts;

	if (inviteCode) {
		const invite = await getValidInviteForEmail(db, inviteCode, email);
		if (!invite) {
			return {
				ok: false,
				error: 'That invitation is invalid, expired, or for a different email address.',
				email
			};
		}
		cookies.set(INVITE_COOKIE_NAME, inviteCode, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: TIMEZONE_COOKIE_MAX_AGE_S
		});
	} else {
		cookies.delete(INVITE_COOKIE_NAME, { path: '/' });
	}

	// Stash the browser-detected timezone in a short-lived cookie so the
	// magic-link verify handler can apply it when creating a brand-new user.
	// Safe to skip if missing or invalid — the users.timezone default kicks in.
	if (browserTimezone && isValidTimezone(browserTimezone)) {
		cookies.set(TIMEZONE_COOKIE_NAME, browserTimezone, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: TIMEZONE_COOKIE_MAX_AGE_S
		});
	} else {
		cookies.delete(TIMEZONE_COOKIE_NAME, { path: '/' });
	}

	if (displayName) {
		cookies.set(SIGNUP_NAME_COOKIE_NAME, displayName, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: TIMEZONE_COOKIE_MAX_AGE_S
		});
	} else {
		cookies.delete(SIGNUP_NAME_COOKIE_NAME, { path: '/' });
	}

	try {
		const { token, code } = await createMagicLink(db, email);
		if (platform) {
			await sendMagicLinkEmail(platform, email, token, code, origin);
		}
	} catch (err) {
		console.error('Magic link error:', err);
		// Don't reveal errors to the user for security.
	}

	return { ok: true, email };
}

/** Create an auth session and return the raw token (for the cookie). */
export async function createSession(
	db: ORM,
	userId: string
): Promise<{ token: string; expiresAt: Date }> {
	const token = nanoid(48);
	const tokenHash = await hashToken(token);
	const id = nanoid();
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

	await db.insert(userSessions).values({
		id,
		userId,
		tokenHash,
		expiresAt: expiresAt.toISOString()
	});

	return { token, expiresAt };
}

/** Validate a session token and return the user. */
export async function validateSession(
	db: ORM,
	token: string
): Promise<{ user: typeof users.$inferSelect; sessionId: string } | null> {
	const tokenHash = await hashToken(token);
	const now = new Date().toISOString();

	const result = await db
		.select({
			sessionId: userSessions.id,
			user: users
		})
		.from(userSessions)
		.innerJoin(users, eq(userSessions.userId, users.id))
		.where(and(eq(userSessions.tokenHash, tokenHash), gt(userSessions.expiresAt, now)))
		.get();

	if (!result) return null;
	return { user: result.user, sessionId: result.sessionId };
}

/** Invalidate a session. */
export async function invalidateSession(db: ORM, token: string): Promise<void> {
	const tokenHash = await hashToken(token);
	await db.delete(userSessions).where(eq(userSessions.tokenHash, tokenHash));
}

export function requirePermission(locals: RequestEvent['locals'], permission: string) {
	if (!locals.permissions.has(permission)) {
		error(403, 'Unauthorized');
	}
}

/**
 * Shared completion step for both magic-link and one-time-code verification.
 * Creates the user if needed, creates a session, sets the session cookie, and
 * throws a SvelteKit redirect to either the stashed post-login path or '/'.
 */
export async function completeMagicLinkLogin(
	db: ORM,
	cookies: Cookies,
	platform: App.Platform | undefined,
	result: { email: string; userId: string | null }
): Promise<never> {
	const redir = cookies.get(REDIR_COOKIE_NAME);
	if (redir) {
		cookies.delete(REDIR_COOKIE_NAME, { path: '/' });
	}

	// Read the browser-detected timezone that the login form stashed. If the
	// code/link is used on a different device the cookie won't be there; we
	// fall back to the users.timezone default. If present but invalid, drop
	// it so the default kicks in.
	const cookieTimezone = cookies.get(TIMEZONE_COOKIE_NAME);
	if (cookieTimezone) {
		cookies.delete(TIMEZONE_COOKIE_NAME, { path: '/' });
	}
	const timezone = isValidTimezone(cookieTimezone) ? cookieTimezone : undefined;
	const signupName = cookies.get(SIGNUP_NAME_COOKIE_NAME);
	if (signupName) {
		cookies.delete(SIGNUP_NAME_COOKIE_NAME, { path: '/' });
	}
	const inviteCode = cookies.get(INVITE_COOKIE_NAME);
	if (inviteCode) {
		cookies.delete(INVITE_COOKIE_NAME, { path: '/' });
	}
	const invite = inviteCode ? await getValidInviteForEmail(db, inviteCode, result.email) : null;
	const signupMode = getSignupMode(platform?.env.ALLOW_SIGNUP);

	const { id: userId } = await findOrCreateUser(db, result.email, {
		role: 'member',
		allowSignup: !!invite || signupMode !== 'closed',
		status: invite || signupMode === 'open' ? 'active' : 'pending',
		timezone,
		name: signupName
	});

	if (!userId) {
		redirect(302, '/auth/login?error=no_signup');
	}

	if (invite) {
		await claimInvite(db, invite.id, userId);
		await db.update(users).set({ status: 'active' }).where(eq(users.id, userId));
	}

	const user = await db
		.select({ status: users.status })
		.from(users)
		.where(eq(users.id, userId))
		.get();

	if (user?.status === 'pending') {
		redirect(302, '/auth/login?error=pending_approval');
	}
	if (user?.status === 'suspended') {
		redirect(302, '/auth/login?error=suspended');
	}

	const session = await createSession(db, userId);

	cookies.set(SESSION_COOKIE_NAME, session.token, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		expires: session.expiresAt
	});

	if (redir && redir.startsWith('/')) {
		redirect(302, redir);
	}
	redirect(302, '/');
}
