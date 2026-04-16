import { nanoid } from 'nanoid';
import { eq, and, gt, isNull } from 'drizzle-orm';
import type { ORM } from './db';
import { users, authMagicLinks, userSessions } from './db/schema';

const SESSION_COOKIE_NAME = 'storied_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAGIC_LINK_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

export { SESSION_COOKIE_NAME };

// pnpm resolves two drizzle-orm copies (D1 vs libsql peer variants) whose private SQL types
// are structurally identical but nominally incompatible. The `as any` casts below silence the
// TS2345 mismatch between the two copies – the same workaround used in schema.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _eq: any = eq;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _and: any = and;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _gt: any = gt;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _isNull: any = isNull;

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
		.where(_eq(users.email, email.toLowerCase()))
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
			_and(
				_eq(authMagicLinks.tokenHash, tokenHash),
				_gt(authMagicLinks.expiresAt, now),
				_isNull(authMagicLinks.consumedAt)
			)
		)
		.get();

	if (!link) return null;

	// Consume the link
	await db.update(authMagicLinks).set({ consumedAt: now }).where(_eq(authMagicLinks.id, link.id));

	return { email: link.email, userId: link.userId };
}

/** Create or find a user by email. If new, creates with 'active' status and the email as display name. */
export async function findOrCreateUser(
	db: ORM,
	email: string
): Promise<{ id: string; isNew: boolean }> {
	const existing = await db.select().from(users).where(_eq(users.email, email.toLowerCase())).get();
	if (existing) return { id: existing.id, isNew: false };

	const id = nanoid();
	const displayName = email.split('@')[0];
	await db.insert(users).values({
		id,
		email: email.toLowerCase(),
		displayName,
		role: 'member',
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
		.innerJoin(users, _eq(userSessions.userId, users.id))
		.where(_and(_eq(userSessions.tokenHash, tokenHash), _gt(userSessions.expiresAt, now)))
		.get();

	if (!result) return null;
	return { user: result.user, sessionId: result.sessionId };
}

/** Invalidate a session. */
export async function invalidateSession(db: ORM, token: string): Promise<void> {
	const tokenHash = await hashToken(token);
	await db.delete(userSessions).where(_eq(userSessions.tokenHash, tokenHash));
}
