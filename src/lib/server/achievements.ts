import { nanoid } from 'nanoid';
import { and, eq } from 'drizzle-orm';
import type { ORM } from '$lib/server/db';
import { userAchievements } from '$lib/server/db/schema';

export const RESTRICTED_CATALOG_ACHIEVEMENT = 'restricted_catalog';

export async function hasAchievement(db: ORM, userId: string, achievementKey: string) {
	const row = await db
		.select({ id: userAchievements.id })
		.from(userAchievements)
		.where(
			and(eq(userAchievements.userId, userId), eq(userAchievements.achievementKey, achievementKey))
		)
		.get();
	return Boolean(row);
}

export async function awardAchievement(
	db: ORM,
	userId: string,
	achievementKey: string,
	metadata?: Record<string, unknown>
) {
	const inserted = await db
		.insert(userAchievements)
		.values({
			id: nanoid(),
			userId,
			achievementKey,
			source: 'challenge',
			metadataJson: metadata ? JSON.stringify(metadata) : null
		})
		.onConflictDoNothing()
		.returning({ id: userAchievements.id });
	return inserted.length > 0;
}
