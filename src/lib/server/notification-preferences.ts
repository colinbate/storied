import { eq } from 'drizzle-orm';
import type { ORM } from './db';
import { notificationPreferences } from './db/schema';

export type NotificationPreferences = typeof notificationPreferences.$inferSelect;

/**
 * Ensure a notification_preferences row exists for the given user and return
 * it. Belt-and-braces alongside the migration backfill — callers should be
 * able to rely on getting a row back.
 */
export async function getOrCreateNotificationPreferences(
	db: ORM,
	userId: string
): Promise<NotificationPreferences> {
	const existing = await db
		.select()
		.from(notificationPreferences)
		.where(eq(notificationPreferences.userId, userId))
		.get();
	if (existing) return existing;

	const inserted = await db
		.insert(notificationPreferences)
		.values({ userId })
		.onConflictDoNothing()
		.returning();

	if (!inserted) {
		throw new Error(`Failed to create notification_preferences for user ${userId}`);
	}
	return inserted[0];
}

// Cache the set of IANA timezone identifiers lazily on first use.
let timezoneSet: Set<string> | null = null;

/**
 * Validate that a string is a well-formed IANA timezone identifier.
 * Uses `Intl.supportedValuesOf('timeZone')` (supported in recent V8 /
 * Workers runtime) with a fallback that tries to construct a
 * DateTimeFormat and sees whether the runtime accepts the zone.
 */
export function isValidTimezone(tz: unknown): tz is string {
	if (typeof tz !== 'string' || tz.length === 0) return false;

	if (timezoneSet === null) {
		try {
			// `Intl.supportedValuesOf` is available in modern V8 (Workers runtime).
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const anyIntl = Intl as any;
			if (typeof anyIntl.supportedValuesOf === 'function') {
				timezoneSet = new Set<string>(anyIntl.supportedValuesOf('timeZone'));
			}
		} catch {
			timezoneSet = null;
		}
	}

	if (timezoneSet) return timezoneSet.has(tz);

	// Fallback: try to construct a DateTimeFormat with the zone.
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

export const DEFAULT_TIMEZONE = 'Atlantic/Bermuda';
