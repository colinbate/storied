import type { Actions, PageServerLoad } from './$types';
import {
	categories,
	posts,
	sessionAgendaItems,
	sessionMessages,
	sessionParticipants,
	sessionReadingChoices,
	sessionReminderDeliveries,
	sessions,
	sessionSubjects,
	threads,
	users
} from '$lib/server/db/schema';
import { and, count, eq, gt, inArray } from 'drizzle-orm';
import { publishWorkerMessage } from '$lib/server/worker-queue';
import { fail } from '@sveltejs/kit';
import { sessionStartDate } from '$shared/session-lifecycle';

function countBySession<T extends { sessionId: string }>(rows: T[]) {
	const counts = new Map<string, number>();
	for (const row of rows) counts.set(row.sessionId, (counts.get(row.sessionId) ?? 0) + 1);
	return counts;
}

export const load: PageServerLoad = async ({ locals }) => {
	const canManageSessions = locals.permissions.has('sessions:edit');
	const canManageMembers = locals.permissions.has('members:edit');

	const [userCount, threadCount, postCount, categoryCount, pendingMemberCount, activeSessions] =
		await Promise.all([
			locals.db.select({ count: count() }).from(users).get(),
			locals.db.select({ count: count() }).from(threads).get(),
			locals.db.select({ count: count() }).from(posts).get(),
			locals.db.select({ count: count() }).from(categories).get(),
			canManageMembers
				? locals.db.select({ count: count() }).from(users).where(eq(users.status, 'pending')).get()
				: Promise.resolve(undefined),
			canManageSessions
				? locals.db
						.select()
						.from(sessions)
						.where(inArray(sessions.status, ['current', 'scheduled', 'draft']))
						.all()
				: Promise.resolve([])
		]);

	const activeSessionIds = activeSessions.map((session) => session.id);
	const [participants, linkedBooks, readingChoices, agendaItems, failedMessages, failedReminders] =
		await Promise.all([
			activeSessionIds.length
				? locals.db
						.select({
							sessionId: sessionParticipants.sessionId,
							status: sessionParticipants.attendanceStatus
						})
						.from(sessionParticipants)
						.where(inArray(sessionParticipants.sessionId, activeSessionIds))
						.all()
				: Promise.resolve([]),
			activeSessionIds.length
				? locals.db
						.select({ sessionId: sessionSubjects.sessionId })
						.from(sessionSubjects)
						.where(
							and(
								inArray(sessionSubjects.sessionId, activeSessionIds),
								eq(sessionSubjects.subjectType, 'book')
							)
						)
						.all()
				: Promise.resolve([]),
			activeSessionIds.length
				? locals.db
						.select({ sessionId: sessionReadingChoices.sessionId })
						.from(sessionReadingChoices)
						.where(inArray(sessionReadingChoices.sessionId, activeSessionIds))
						.all()
				: Promise.resolve([]),
			activeSessionIds.length
				? locals.db
						.select({
							sessionId: sessionAgendaItems.sessionId,
							status: sessionAgendaItems.status
						})
						.from(sessionAgendaItems)
						.where(inArray(sessionAgendaItems.sessionId, activeSessionIds))
						.all()
				: Promise.resolve([]),
			canManageSessions
				? locals.db
						.select({
							sessionId: sessionMessages.sessionId,
							failedCount: sessionMessages.failedCount,
							updatedAt: sessionMessages.updatedAt,
							title: sessions.title,
							slug: sessions.slug
						})
						.from(sessionMessages)
						.innerJoin(sessions, eq(sessionMessages.sessionId, sessions.id))
						.where(gt(sessionMessages.failedCount, 0))
						.all()
				: Promise.resolve([]),
			canManageSessions
				? locals.db
						.select({
							sessionId: sessionReminderDeliveries.sessionId,
							updatedAt: sessionReminderDeliveries.updatedAt,
							title: sessions.title,
							slug: sessions.slug
						})
						.from(sessionReminderDeliveries)
						.innerJoin(sessions, eq(sessionReminderDeliveries.sessionId, sessions.id))
						.where(eq(sessionReminderDeliveries.status, 'failed'))
						.all()
				: Promise.resolve([])
		]);

	const linkedBookCounts = countBySession(linkedBooks);
	const readingChoiceCounts = countBySession(readingChoices);
	const agendaCounts = countBySession(agendaItems.filter((item) => item.status !== 'pending'));
	const pendingAgendaCounts = countBySession(
		agendaItems.filter((item) => item.status === 'pending')
	);

	const allSessionWork = activeSessions
		.map((session) => {
			const participantRows = participants.filter((row) => row.sessionId === session.id);
			const attendingCount = participantRows.filter((row) => row.status === 'attending').length;
			const waitlistCount = participantRows.filter((row) => row.status === 'waitlisted').length;
			const maybeCount = participantRows.filter((row) => row.status === 'maybe').length;
			const bookCount = linkedBookCounts.get(session.id) ?? 0;
			const readingCount = readingChoiceCounts.get(session.id) ?? 0;
			const agendaCount = agendaCounts.get(session.id) ?? 0;
			const pendingAgendaCount = pendingAgendaCounts.get(session.id) ?? 0;
			const preparationIssues: string[] = [];
			if (!session.startsAt) preparationIssues.push('Set date and time');
			if (!session.themeId && !session.themeTitle && !session.theme)
				preparationIssues.push('Choose theme');
			if (!session.locationName) preparationIssues.push('Add location');
			if (bookCount === 0 && readingCount === 0) preparationIssues.push('Add reading details');
			if (agendaCount === 0) preparationIssues.push('Build agenda');
			if (pendingAgendaCount > 0)
				preparationIssues.push(
					`${pendingAgendaCount} agenda ${pendingAgendaCount === 1 ? 'suggestion' : 'suggestions'}`
				);

			return {
				id: session.id,
				slug: session.slug,
				title: session.title,
				status: session.status,
				startsAt: session.startsAt,
				timezone: session.timezone,
				durationMinutes: session.durationMinutes,
				theme: session.themeTitle ?? session.theme,
				rsvpCapacity: session.rsvpCapacity,
				attendingCount,
				waitlistCount,
				maybeCount,
				bookCount,
				readingCount,
				agendaCount,
				pendingAgendaCount,
				preparationIssues
			};
		})
		.sort((a, b) => {
			const statusOrder = { current: 0, scheduled: 1, draft: 2, past: 3, cancelled: 4 } as const;
			const statusDifference = statusOrder[a.status] - statusOrder[b.status];
			if (statusDifference !== 0) return statusDifference;
			const aStart = sessionStartDate(a)?.getTime() ?? Number.POSITIVE_INFINITY;
			const bStart = sessionStartDate(b)?.getTime() ?? Number.POSITIVE_INFINITY;
			return aStart - bStart;
		});
	const sessionAttentionCount = allSessionWork.filter(
		(session) => session.preparationIssues.length > 0
	).length;
	const sessionWork = allSessionWork.slice(0, 6);

	const failedNoticeMap = new Map<
		string,
		{
			sessionId: string;
			title: string;
			slug: string;
			count: number;
			messageFailureCount: number;
			reminderFailureCount: number;
			updatedAt: string;
		}
	>();
	for (const row of failedMessages) {
		const existing = failedNoticeMap.get(row.sessionId);
		failedNoticeMap.set(row.sessionId, {
			sessionId: row.sessionId,
			title: row.title,
			slug: row.slug,
			count: (existing?.count ?? 0) + row.failedCount,
			messageFailureCount: (existing?.messageFailureCount ?? 0) + row.failedCount,
			reminderFailureCount: existing?.reminderFailureCount ?? 0,
			updatedAt: existing && existing.updatedAt > row.updatedAt ? existing.updatedAt : row.updatedAt
		});
	}
	for (const row of failedReminders) {
		const existing = failedNoticeMap.get(row.sessionId);
		failedNoticeMap.set(row.sessionId, {
			sessionId: row.sessionId,
			title: row.title,
			slug: row.slug,
			count: (existing?.count ?? 0) + 1,
			messageFailureCount: existing?.messageFailureCount ?? 0,
			reminderFailureCount: (existing?.reminderFailureCount ?? 0) + 1,
			updatedAt: existing && existing.updatedAt > row.updatedAt ? existing.updatedAt : row.updatedAt
		});
	}
	const failedNotices = [...failedNoticeMap.values()].sort((a, b) =>
		b.updatedAt.localeCompare(a.updatedAt)
	);

	return {
		stats: {
			users: userCount?.count ?? 0,
			threads: threadCount?.count ?? 0,
			posts: postCount?.count ?? 0,
			categories: categoryCount?.count ?? 0
		},
		canManageSessions,
		canManageMembers,
		pendingMemberCount: pendingMemberCount?.count ?? 0,
		sessionAttentionCount,
		sessionWork,
		failedNotices,
		failedNoticeCount: failedNotices.reduce((total, item) => total + item.count, 0)
	};
};

export const actions: Actions = {
	rebuildSearch: async ({ platform, locals }) => {
		if (!locals.permissions.has('search:rebuild')) return { searchRebuildQueued: false };
		await publishWorkerMessage(platform?.env.STORIED_WORKER, 'search.rebuild', { scope: 'all' });
		return { searchRebuildQueued: true };
	},
	deployStaticSite: async ({ platform, locals }) => {
		if (!locals.permissions.has('static-site:deploy') || locals.user?.role !== 'admin') {
			return fail(403, { staticSiteDeployError: 'Only admins can deploy the static site.' });
		}

		const deployHookUrl = platform?.env.DEPLOY_HOOK_URL?.trim();
		if (!deployHookUrl) {
			return fail(500, {
				staticSiteDeployError: 'Static site deploy hook is not configured.'
			});
		}

		const response = await fetch(deployHookUrl, { method: 'POST' });
		let payload: {
			success?: boolean;
			errors?: unknown[];
			messages?: unknown[];
			result?: {
				build_uuid?: string;
				branch?: string;
				worker?: string;
				already_exists?: boolean;
			};
		} | null = null;

		try {
			payload = await response.json();
		} catch {
			// Cloudflare normally returns JSON, but keep the user-facing error useful if that changes.
		}

		if (!response.ok || payload?.success === false) {
			const errorMessage =
				payload?.errors?.map(String).filter(Boolean).join(' ') ||
				`Cloudflare deploy hook failed with status ${response.status}.`;

			return fail(response.ok ? 502 : response.status, {
				staticSiteDeployError: errorMessage
			});
		}

		return {
			staticSiteDeployQueued: true,
			staticSiteDeployBuildUuid: payload?.result?.build_uuid,
			staticSiteDeployAlreadyExists: !!payload?.result?.already_exists
		};
	}
};
