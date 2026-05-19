import { asc, eq } from 'drizzle-orm';

import type { ORM } from '$lib/server/db';
import { users } from '$lib/server/db/schema';

export type MentionableUser = {
	id: string;
	email: string;
	displayName: string;
};

function normalizeMentionTarget(value: string) {
	return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isMentionBoundary(value: string | undefined) {
	return value === undefined || !/[A-Za-z0-9._%+-]/.test(value);
}

export async function listActiveMentionableUsers(db: ORM): Promise<MentionableUser[]> {
	return db
		.select({
			id: users.id,
			email: users.email,
			displayName: users.displayName
		})
		.from(users)
		.where(eq(users.status, 'active'))
		.orderBy(asc(users.displayName))
		.all();
}

export function findMentionedUserIds(bodySource: string, mentionableUsers: MentionableUser[]) {
	const mentionedIds = new Set<string>();
	const normalizedBody = normalizeMentionTarget(bodySource);
	const sortedUsers = mentionableUsers
		.map((user) => ({
			...user,
			targets: [user.email, user.displayName]
				.map((target) => normalizeMentionTarget(target))
				.filter((target, index, targets) => target.length > 0 && targets.indexOf(target) === index)
		}))
		.sort((a, b) => {
			const longestA = Math.max(...a.targets.map((target) => target.length));
			const longestB = Math.max(...b.targets.map((target) => target.length));
			return longestB - longestA;
		});

	for (const user of sortedUsers) {
		if (user.targets.some((target) => hasMention(normalizedBody, target))) {
			mentionedIds.add(user.id);
		}
	}

	return [...mentionedIds];
}

function hasMention(normalizedBody: string, normalizedTarget: string) {
	let index = normalizedBody.indexOf(`@${normalizedTarget}`);
	while (index !== -1) {
		const endIndex = index + normalizedTarget.length + 1;
		if (isMentionBoundary(normalizedBody[endIndex])) return true;
		index = normalizedBody.indexOf(`@${normalizedTarget}`, index + 1);
	}
	return false;
}
