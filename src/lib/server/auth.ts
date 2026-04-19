import { nanoid } from 'nanoid';
import { eq, and, gt, isNull } from 'drizzle-orm';
import type { ORM } from './db';
import { users, authMagicLinks, userSessions } from './db/schema';
import { error, type RequestEvent } from '@sveltejs/kit';

const REDIR_COOKIE_NAME = 'storied-redirect';
const SESSION_COOKIE_NAME = 'storied_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAGIC_LINK_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

export { SESSION_COOKIE_NAME, REDIR_COOKIE_NAME };

/** Hash a token using Web Crypto (available in CF Workers) */
async function hashToken(token: string): Promise<string> {
	const encoded = new TextEncoder().encode(token);
	const digest = await crypto.subtle.digest('SHA-256', encoded);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/** Create a magic link token for the given email. Returns the raw token (to be put in the URL). */
export async function createMagicLink(
	db: ORM,
	email: string
): Promise<{ token: string; id: string }> {
	const token = nanoid(48);
	const tokenHash = await hashToken(token);
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
		userId: existingUser?.id ?? null,
		expiresAt
	});

	return { token, id };
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

/** Create or find a user by email. If new, creates with 'active' status and the email as display name. */
export type UserRole = 'member' | 'moderator' | 'admin';

export const USER_ROLES: UserRole[] = ['member', 'moderator', 'admin'];

export function isUserRole(value: unknown): value is UserRole {
	return typeof value === 'string' && (USER_ROLES as string[]).includes(value);
}

export async function findOrCreateUser(
	db: ORM,
	email: string,
	role: UserRole = 'member',
	allowSignup = true
): Promise<{ id: string; isNew: boolean }> {
	const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
	if (existing) return { id: existing.id, isNew: false };
	if (!allowSignup) return { id: '', isNew: false };
	const id = nanoid();
	const displayName = email.split('@')[0];
	await db.insert(users).values({
		id,
		email: email.toLowerCase(),
		displayName,
		role,
		status: 'active'
	});

	return { id, isNew: true };
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
