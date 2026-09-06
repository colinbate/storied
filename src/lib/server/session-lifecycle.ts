import { and, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import type { ORM } from './db';
import { sessions, sessionParticipants, subscriptions, themes, threads } from './db/schema';
import { hasSessionEnded, type SessionStatus } from '$shared/session-lifecycle';
import { newId } from './ids';
import {
	buildSessionDiscussionBody,
	createUniqueThreadSlug,
	SESSION_DISCUSSIONS_CATEGORY_ID
} from './discussions';
import { renderMarkdown } from './markdown';
import { defaultAgendaCopyStatements } from './session-workflow';

type BatchItem = Parameters<ORM['batch']>[0][number];

/** Draft access is independent of public-site visibility. */
export function sessionAccessCondition(locals: App.Locals) {
	return locals.permissions.has('sessions:edit') ? sql`1 = 1` : ne(sessions.status, 'draft');
}

export async function currentSessionChanges(db: ORM, targetId: string, now = new Date()) {
	const current = await db
		.select()
		.from(sessions)
		.where(and(eq(sessions.status, 'current'), ne(sessions.id, targetId)))
		.all();
	return current.map((session) => ({
		session,
		status: hasSessionEnded(session, now) ? ('past' as const) : ('scheduled' as const)
	}));
}

export function selectThemeStatement(db: ORM, themeId: string, condition?: SQL) {
	return db
		.update(themes)
		.set({
			status: 'selected',
			selectedAt: sql`COALESCE(${themes.selectedAt}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
			archivedAt: null
		})
		.where(and(eq(themes.id, themeId), condition));
}

export async function createClubSession(
	db: ORM,
	session: typeof sessions.$inferInsert,
	authorUserId: string,
	subscriptionMode: string | null
) {
	const threadId = newId();
	const bodySource = buildSessionDiscussionBody(session);
	const slug = await createUniqueThreadSlug(db, session.title);
	const now = new Date().toISOString();
	const changes = session.status === 'current' ? await currentSessionChanges(db, session.id) : [];
	const statements: BatchItem[] = changes.map(({ session: previous, status }) =>
		db
			.update(sessions)
			.set({ status, updatedAt: now })
			.where(and(eq(sessions.id, previous.id), eq(sessions.status, 'current')))
	);
	statements.push(
		db.insert(sessions).values(session),
		db.insert(threads).values({
			id: threadId,
			categoryId: SESSION_DISCUSSIONS_CATEGORY_ID,
			authorUserId,
			sessionId: session.id,
			sessionThreadRole: 'primary',
			title: session.title,
			slug,
			bodySource,
			bodyHtml: renderMarkdown(bodySource),
			visibility: 'members',
			lastPostAt: now
		})
	);
	if (subscriptionMode)
		statements.push(
			db
				.insert(subscriptions)
				.values({ id: newId(), userId: authorUserId, threadId, mode: subscriptionMode })
		);
	if (session.status !== 'draft' && session.themeId)
		statements.push(selectThemeStatement(db, session.themeId));
	statements.push(...(await defaultAgendaCopyStatements(db, session.id)));
	// D1 batches are transactional: a failed insert also rolls back the previous current session.
	await db.batch(statements as [BatchItem, ...BatchItem[]]);
	return { threadId };
}

export async function changeSessionStatus(
	db: ORM,
	session: typeof sessions.$inferSelect,
	status: SessionStatus
) {
	if (status === 'draft' && session.status !== 'draft') {
		const registration = await db
			.select({ id: sessionParticipants.id })
			.from(sessionParticipants)
			.where(
				and(
					eq(sessionParticipants.sessionId, session.id),
					inArray(sessionParticipants.attendanceStatus, ['attending', 'waitlisted'])
				)
			)
			.get();
		if (registration)
			return {
				error:
					'This session has registrations. Keep it published or mark it cancelled instead of returning it to draft.'
			};
	}
	const now = new Date().toISOString();
	const changes = status === 'current' ? await currentSessionChanges(db, session.id) : [];
	const unchanged = sql`EXISTS (SELECT 1 FROM sessions target WHERE target.id = ${session.id} AND target.updated_at = ${session.updatedAt})`;
	const statements: BatchItem[] = changes.map(({ session: previous, status }) =>
		db
			.update(sessions)
			.set({ status, updatedAt: now })
			.where(and(eq(sessions.id, previous.id), eq(sessions.status, 'current'), unchanged))
	);
	if (status !== 'draft' && session.themeId)
		statements.push(selectThemeStatement(db, session.themeId, unchanged));
	const updateIndex = statements.length;
	statements.push(
		db
			.update(sessions)
			.set({ status, updatedAt: now })
			.where(and(eq(sessions.id, session.id), eq(sessions.updatedAt, session.updatedAt)))
			.returning({ id: sessions.id })
	);
	const results = await db.batch(statements as [BatchItem, ...BatchItem[]]);
	if (!(results[updateIndex] as unknown[]).length)
		return {
			error: 'This session changed after the form was loaded. Reload the page and try again.'
		};
	return {
		error: null,
		previousPastCount: changes.filter((change) => change.status === 'past').length,
		previousUpcomingCount: changes.filter((change) => change.status === 'scheduled').length
	};
}
