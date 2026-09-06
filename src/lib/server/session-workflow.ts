import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';

import type { ORM } from '$lib/server/db';
import {
	attendeeIdentities,
	defaultAgendaItems,
	sessionAgendaItems,
	sessionAttendance,
	sessionFeedback,
	sessionParticipants,
	sessionQuickNotes,
	sessions,
	users,
	type AgendaItemStatus,
	type AgendaItemVisibility,
	type SessionAttendanceOutcome,
	type SessionFeedbackPace
} from '$lib/server/db/schema';
import { newId } from '$lib/server/ids';
import { renderMarkdown } from '$lib/server/markdown';
import { hasSessionEnded } from '$shared/session-lifecycle';

type StoriedSession = typeof sessions.$inferSelect;
export type AgendaItem = typeof sessionAgendaItems.$inferSelect;
export type AttendanceRecord = typeof sessionAttendance.$inferSelect;

export const AGENDA_VISIBILITIES: AgendaItemVisibility[] = ['members', 'facilitator'];
export const AGENDA_STATUSES: AgendaItemStatus[] = ['pending', 'ready', 'completed', 'skipped'];
export const FEEDBACK_PACES: SessionFeedbackPace[] = ['too_slow', 'about_right', 'too_fast'];

export function isAgendaVisibility(value: unknown): value is AgendaItemVisibility {
	return AGENDA_VISIBILITIES.some((v) => v === value);
}
export function isAgendaStatus(value: unknown): value is AgendaItemStatus {
	return AGENDA_STATUSES.some((v) => v === value);
}
export function isFeedbackPace(value: unknown): value is SessionFeedbackPace {
	return FEEDBACK_PACES.some((v) => v === value);
}

export function canFacilitate(locals: App.Locals) {
	return locals.permissions.has('sessions:facilitate');
}

const now = () => new Date().toISOString();

// ──────────────────────────────────────────────
// Derived workflow phase
// ──────────────────────────────────────────────

export type WorkflowPhase = 'prepare' | 'run' | 'recap';

/** UI label only; the publication status remains the source of truth for visibility. */
export function workflowPhase(
	session: Pick<
		StoriedSession,
		'status' | 'startsAt' | 'timezone' | 'durationMinutes' | 'liveStartedAt' | 'liveEndedAt'
	>,
	at = new Date()
): WorkflowPhase {
	if (session.liveStartedAt && !session.liveEndedAt) return 'run';
	if (session.liveEndedAt || session.status === 'past' || hasSessionEnded(session, at))
		return 'recap';
	return 'prepare';
}

/** Members may reflect once the meeting is over and the facilitator has not turned it off. */
export function canGiveFeedback(
	session: Pick<
		StoriedSession,
		| 'status'
		| 'startsAt'
		| 'timezone'
		| 'durationMinutes'
		| 'liveStartedAt'
		| 'liveEndedAt'
		| 'feedbackEnabled'
	>,
	at = new Date()
) {
	return (
		session.feedbackEnabled &&
		session.status !== 'draft' &&
		session.status !== 'cancelled' &&
		workflowPhase(session, at) === 'recap'
	);
}

// ──────────────────────────────────────────────
// Default agenda
// ──────────────────────────────────────────────

export async function listDefaultAgenda(db: ORM) {
	return db.select().from(defaultAgendaItems).orderBy(asc(defaultAgendaItems.sortOrder)).all();
}

export async function createDefaultAgendaItem(
	db: ORM,
	input: { title: string; description?: string | null; visibility?: AgendaItemVisibility }
) {
	const last = await db
		.select({ sortOrder: defaultAgendaItems.sortOrder })
		.from(defaultAgendaItems)
		.orderBy(desc(defaultAgendaItems.sortOrder))
		.get();
	return db
		.insert(defaultAgendaItems)
		.values({
			id: newId(),
			title: input.title,
			description: input.description ?? null,
			visibility: input.visibility ?? 'members',
			sortOrder: (last?.sortOrder ?? -1) + 1
		})
		.returning()
		.get();
}

export async function updateDefaultAgendaItem(
	db: ORM,
	id: string,
	input: { title?: string; description?: string | null; visibility?: AgendaItemVisibility }
) {
	return db
		.update(defaultAgendaItems)
		.set({ ...input, updatedAt: now() })
		.where(eq(defaultAgendaItems.id, id))
		.returning()
		.get();
}

export async function deleteDefaultAgendaItem(db: ORM, id: string) {
	await db.delete(defaultAgendaItems).where(eq(defaultAgendaItems.id, id));
}

export async function reorderDefaultAgenda(db: ORM, orderedIds: string[]) {
	const stamp = now();
	for (const [index, id] of orderedIds.entries()) {
		await db
			.update(defaultAgendaItems)
			.set({ sortOrder: index, updatedAt: stamp })
			.where(eq(defaultAgendaItems.id, id));
	}
}

/** Insert statements that copy the default agenda into a new session. Independent records. */
export async function defaultAgendaCopyStatements(db: ORM, sessionId: string) {
	const items = await listDefaultAgenda(db);
	return items.map((item, index) =>
		db.insert(sessionAgendaItems).values({
			id: newId(),
			sessionId,
			title: item.title,
			description: item.description,
			sortOrder: index,
			visibility: item.visibility,
			status: 'ready',
			source: 'facilitator'
		})
	);
}

// ──────────────────────────────────────────────
// Session agenda
// ──────────────────────────────────────────────

export type AgendaViewer = { userId: string | null; canFacilitate: boolean };

/**
 * Facilitators see everything. Members see accepted member-visible items plus their own
 * pending suggestions, never other members' suggestions or facilitator-only items.
 */
export async function getSessionAgenda(db: ORM, sessionId: string, viewer: AgendaViewer) {
	const items = await db
		.select()
		.from(sessionAgendaItems)
		.where(eq(sessionAgendaItems.sessionId, sessionId))
		.orderBy(asc(sessionAgendaItems.sortOrder), asc(sessionAgendaItems.createdAt))
		.all();
	if (viewer.canFacilitate) return items;
	return items.filter(
		(item) =>
			(item.visibility === 'members' && item.status !== 'pending') ||
			(item.status === 'pending' && item.submittedByUserId === viewer.userId)
	);
}

async function nextAgendaSortOrder(db: ORM, sessionId: string) {
	const last = await db
		.select({ sortOrder: sessionAgendaItems.sortOrder })
		.from(sessionAgendaItems)
		.where(eq(sessionAgendaItems.sessionId, sessionId))
		.orderBy(desc(sessionAgendaItems.sortOrder))
		.get();
	return (last?.sortOrder ?? -1) + 1;
}

export async function createAgendaItem(
	db: ORM,
	sessionId: string,
	input: { title: string; description?: string | null; visibility?: AgendaItemVisibility }
) {
	return db
		.insert(sessionAgendaItems)
		.values({
			id: newId(),
			sessionId,
			title: input.title,
			description: input.description ?? null,
			visibility: input.visibility ?? 'members',
			status: 'ready',
			source: 'facilitator',
			sortOrder: await nextAgendaSortOrder(db, sessionId)
		})
		.returning()
		.get();
}

export async function updateAgendaItem(
	db: ORM,
	sessionId: string,
	itemId: string,
	input: { title?: string; description?: string | null; visibility?: AgendaItemVisibility }
) {
	return db
		.update(sessionAgendaItems)
		.set({ ...input, updatedAt: now() })
		.where(and(eq(sessionAgendaItems.id, itemId), eq(sessionAgendaItems.sessionId, sessionId)))
		.returning()
		.get();
}

export async function deleteAgendaItem(db: ORM, sessionId: string, itemId: string) {
	await db
		.delete(sessionAgendaItems)
		.where(and(eq(sessionAgendaItems.id, itemId), eq(sessionAgendaItems.sessionId, sessionId)));
}

export async function reorderAgendaItems(db: ORM, sessionId: string, orderedIds: string[]) {
	const stamp = now();
	for (const [index, id] of orderedIds.entries()) {
		await db
			.update(sessionAgendaItems)
			.set({ sortOrder: index, updatedAt: stamp })
			.where(and(eq(sessionAgendaItems.id, id), eq(sessionAgendaItems.sessionId, sessionId)));
	}
}

/** Move one item up or down by swapping sort positions; the keyboard fallback for drag and drop. */
export async function moveAgendaItem(
	db: ORM,
	sessionId: string,
	itemId: string,
	direction: 'up' | 'down'
) {
	const items = await db
		.select({ id: sessionAgendaItems.id })
		.from(sessionAgendaItems)
		.where(
			and(eq(sessionAgendaItems.sessionId, sessionId), ne(sessionAgendaItems.status, 'pending'))
		)
		.orderBy(asc(sessionAgendaItems.sortOrder), asc(sessionAgendaItems.createdAt))
		.all();
	const ids = items.map((item) => item.id);
	const index = ids.indexOf(itemId);
	const target = direction === 'up' ? index - 1 : index + 1;
	if (index === -1 || target < 0 || target >= ids.length) return false;
	[ids[index], ids[target]] = [ids[target], ids[index]];
	await reorderAgendaItems(db, sessionId, ids);
	return true;
}

export async function setAgendaItemStatus(
	db: ORM,
	sessionId: string,
	itemId: string,
	status: Exclude<AgendaItemStatus, 'pending'>
) {
	const stamp = now();
	return db
		.update(sessionAgendaItems)
		.set({
			status,
			completedAt: status === 'completed' ? stamp : null,
			updatedAt: stamp
		})
		.where(and(eq(sessionAgendaItems.id, itemId), eq(sessionAgendaItems.sessionId, sessionId)))
		.returning()
		.get();
}

export async function submitAgendaSuggestion(
	db: ORM,
	sessionId: string,
	userId: string,
	input: { title: string; description?: string | null }
) {
	return db
		.insert(sessionAgendaItems)
		.values({
			id: newId(),
			sessionId,
			title: input.title,
			description: input.description ?? null,
			visibility: 'members',
			status: 'pending',
			source: 'member',
			submittedByUserId: userId,
			sortOrder: await nextAgendaSortOrder(db, sessionId)
		})
		.returning()
		.get();
}

/** Accept a pending suggestion, optionally editing it or making it facilitator-only first. */
export async function acceptAgendaSuggestion(
	db: ORM,
	sessionId: string,
	itemId: string,
	input: { title?: string; description?: string | null; visibility?: AgendaItemVisibility } = {}
) {
	return db
		.update(sessionAgendaItems)
		.set({ ...input, status: 'ready', updatedAt: now() })
		.where(
			and(
				eq(sessionAgendaItems.id, itemId),
				eq(sessionAgendaItems.sessionId, sessionId),
				eq(sessionAgendaItems.status, 'pending')
			)
		)
		.returning()
		.get();
}

export async function rejectAgendaSuggestion(db: ORM, sessionId: string, itemId: string) {
	await db
		.delete(sessionAgendaItems)
		.where(
			and(
				eq(sessionAgendaItems.id, itemId),
				eq(sessionAgendaItems.sessionId, sessionId),
				eq(sessionAgendaItems.status, 'pending')
			)
		);
}

/** A member may withdraw their own pending suggestion. */
export async function withdrawAgendaSuggestion(
	db: ORM,
	sessionId: string,
	itemId: string,
	userId: string
) {
	await db
		.delete(sessionAgendaItems)
		.where(
			and(
				eq(sessionAgendaItems.id, itemId),
				eq(sessionAgendaItems.sessionId, sessionId),
				eq(sessionAgendaItems.status, 'pending'),
				eq(sessionAgendaItems.submittedByUserId, userId)
			)
		);
}

// ──────────────────────────────────────────────
// Attendance
// ──────────────────────────────────────────────

export async function getSessionAttendance(db: ORM, sessionId: string) {
	return db
		.select()
		.from(sessionAttendance)
		.where(eq(sessionAttendance.sessionId, sessionId))
		.all();
}

export async function getAttendanceByAttendee(db: ORM, sessionId: string) {
	const rows = await getSessionAttendance(db, sessionId);
	return Object.fromEntries(rows.map((row) => [row.attendeeId, row]));
}

export async function recordAttendance(
	db: ORM,
	input: {
		sessionId: string;
		attendeeId: string;
		status: SessionAttendanceOutcome;
		recordedByUserId: string | null;
	}
) {
	const stamp = now();
	return db
		.insert(sessionAttendance)
		.values({
			id: newId(),
			sessionId: input.sessionId,
			attendeeId: input.attendeeId,
			status: input.status,
			recordedAt: stamp,
			recordedByUserId: input.recordedByUserId
		})
		.onConflictDoUpdate({
			target: [sessionAttendance.sessionId, sessionAttendance.attendeeId],
			set: {
				status: input.status,
				recordedAt: stamp,
				recordedByUserId: input.recordedByUserId,
				updatedAt: stamp
			}
		})
		.returning()
		.get();
}

export function markPresent(
	db: ORM,
	sessionId: string,
	attendeeId: string,
	recordedByUserId: string | null
) {
	return recordAttendance(db, { sessionId, attendeeId, status: 'present', recordedByUserId });
}

export function markAbsent(
	db: ORM,
	sessionId: string,
	attendeeId: string,
	recordedByUserId: string | null
) {
	return recordAttendance(db, { sessionId, attendeeId, status: 'absent', recordedByUserId });
}

/** Remove the record entirely so the person is back to "not yet recorded". */
export async function clearAttendance(db: ORM, sessionId: string, attendeeId: string) {
	await db
		.delete(sessionAttendance)
		.where(
			and(eq(sessionAttendance.sessionId, sessionId), eq(sessionAttendance.attendeeId, attendeeId))
		);
}

/** Expected attendees left unrecorded when the meeting ends. */
export async function markUnrecordedExpectedAbsent(
	db: ORM,
	sessionId: string,
	recordedByUserId: string | null
) {
	const expected = await db
		.select({ attendeeId: sessionParticipants.attendeeId })
		.from(sessionParticipants)
		.where(
			and(
				eq(sessionParticipants.sessionId, sessionId),
				eq(sessionParticipants.attendanceStatus, 'attending'),
				sql`NOT EXISTS (
					SELECT 1 FROM ${sessionAttendance}
					WHERE ${sessionAttendance.sessionId} = ${sessionId}
						AND ${sessionAttendance.attendeeId} = ${sessionParticipants.attendeeId}
				)`
			)
		)
		.all();
	for (const row of expected) {
		await markAbsent(db, sessionId, row.attendeeId, recordedByUserId);
	}
	return expected.length;
}

/** People who were present at any session, for "add attendee" pickers and past-attendee audiences. */
export async function presentAttendeeIds(db: ORM, excludeSessionId?: string) {
	const rows = await db
		.select({ attendeeId: sessionAttendance.attendeeId })
		.from(sessionAttendance)
		.where(
			and(
				eq(sessionAttendance.status, 'present'),
				excludeSessionId ? ne(sessionAttendance.sessionId, excludeSessionId) : undefined
			)
		)
		.all();
	return new Set(rows.map((row) => row.attendeeId));
}

// ──────────────────────────────────────────────
// Live session
// ──────────────────────────────────────────────

export async function startLiveSession(db: ORM, sessionId: string) {
	const stamp = now();
	return db
		.update(sessions)
		.set({ liveStartedAt: stamp, liveEndedAt: null, updatedAt: stamp })
		.where(eq(sessions.id, sessionId))
		.returning()
		.get();
}

export async function endLiveSession(db: ORM, sessionId: string) {
	const stamp = now();
	return db
		.update(sessions)
		.set({
			liveStartedAt: sql`COALESCE(${sessions.liveStartedAt}, ${stamp})`,
			liveEndedAt: stamp,
			updatedAt: stamp
		})
		.where(eq(sessions.id, sessionId))
		.returning()
		.get();
}

/** The next published session after this one, if it exists. */
export async function findNextSession(db: ORM, session: StoriedSession) {
	return db
		.select()
		.from(sessions)
		.where(
			and(
				ne(sessions.id, session.id),
				inArray(sessions.status, ['scheduled', 'current', 'draft']),
				session.startsAt
					? or(gt(sessions.startsAt, session.startsAt), isNull(sessions.startsAt))
					: undefined
			)
		)
		.orderBy(asc(sessions.startsAt), asc(sessions.createdAt))
		.get();
}

export async function setNextThemeNote(db: ORM, sessionId: string, note: string | null) {
	return db
		.update(sessions)
		.set({ nextThemeNote: note, updatedAt: now() })
		.where(eq(sessions.id, sessionId))
		.returning()
		.get();
}

/** The most recent session that captured a next-theme idea, for carrying it into a new session. */
export async function latestNextThemeNote(db: ORM) {
	return db
		.select({
			id: sessions.id,
			slug: sessions.slug,
			title: sessions.title,
			nextThemeNote: sessions.nextThemeNote
		})
		.from(sessions)
		.where(sql`${sessions.nextThemeNote} IS NOT NULL AND ${sessions.nextThemeNote} <> ''`)
		.orderBy(desc(sessions.startsAt), desc(sessions.createdAt))
		.get();
}

// ──────────────────────────────────────────────
// Quick notes
// ──────────────────────────────────────────────

export async function getQuickNotes(db: ORM, sessionId: string) {
	return db
		.select({
			note: sessionQuickNotes,
			author: { id: users.id, displayName: users.displayName }
		})
		.from(sessionQuickNotes)
		.leftJoin(users, eq(sessionQuickNotes.createdByUserId, users.id))
		.where(eq(sessionQuickNotes.sessionId, sessionId))
		.orderBy(asc(sessionQuickNotes.createdAt))
		.all();
}

export async function createQuickNote(
	db: ORM,
	sessionId: string,
	body: string,
	createdByUserId: string | null
) {
	return db
		.insert(sessionQuickNotes)
		.values({ id: newId(), sessionId, body, createdByUserId, createdAt: now() })
		.returning()
		.get();
}

export async function deleteQuickNote(db: ORM, sessionId: string, noteId: string) {
	await db
		.delete(sessionQuickNotes)
		.where(and(eq(sessionQuickNotes.id, noteId), eq(sessionQuickNotes.sessionId, sessionId)));
}

// ──────────────────────────────────────────────
// Recaps
// ──────────────────────────────────────────────

export async function updateSessionRecaps(
	db: ORM,
	sessionId: string,
	input: {
		facilitatorRecap: string | null;
		memberRecap: string | null;
		publicRecap: string | null;
		feedbackEnabled: boolean;
	}
) {
	const memberRecap = input.memberRecap?.trim() || null;
	const publicRecap = input.publicRecap?.trim() || null;
	return db
		.update(sessions)
		.set({
			facilitatorRecap: input.facilitatorRecap?.trim() || null,
			memberRecap,
			memberRecapHtml: memberRecap ? renderMarkdown(memberRecap) : null,
			publicRecap,
			publicRecapHtml: publicRecap ? renderMarkdown(publicRecap) : null,
			feedbackEnabled: input.feedbackEnabled,
			updatedAt: now()
		})
		.where(eq(sessions.id, sessionId))
		.returning()
		.get();
}

// ──────────────────────────────────────────────
// Feedback
// ──────────────────────────────────────────────

export async function getOwnSessionFeedback(db: ORM, sessionId: string, userId: string) {
	return db
		.select()
		.from(sessionFeedback)
		.where(and(eq(sessionFeedback.sessionId, sessionId), eq(sessionFeedback.userId, userId)))
		.get();
}

export async function submitSessionFeedback(
	db: ORM,
	input: {
		sessionId: string;
		userId: string;
		overallRating: number | null;
		pace: SessionFeedbackPace | null;
		comments: string | null;
		futureDiscussion: string | null;
	}
) {
	const stamp = now();
	const values = {
		overallRating: input.overallRating,
		pace: input.pace,
		comments: input.comments?.trim() || null,
		futureDiscussion: input.futureDiscussion?.trim() || null,
		updatedAt: stamp
	};
	return db
		.insert(sessionFeedback)
		.values({
			id: newId(),
			sessionId: input.sessionId,
			userId: input.userId,
			createdAt: stamp,
			...values
		})
		.onConflictDoUpdate({
			target: [sessionFeedback.sessionId, sessionFeedback.userId],
			set: values
		})
		.returning()
		.get();
}

export async function getSessionFeedbackForFacilitator(db: ORM, sessionId: string) {
	return db
		.select({
			feedback: sessionFeedback,
			member: { id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl }
		})
		.from(sessionFeedback)
		.innerJoin(users, eq(sessionFeedback.userId, users.id))
		.where(eq(sessionFeedback.sessionId, sessionId))
		.orderBy(desc(sessionFeedback.updatedAt))
		.all();
}

/** Names for the runner and the attendee screen: everyone with an identity, members first. */
export async function listAttendeeChoices(db: ORM) {
	return db
		.select({
			id: attendeeIdentities.id,
			name: attendeeIdentities.name,
			email: attendeeIdentities.email,
			userId: attendeeIdentities.userId
		})
		.from(attendeeIdentities)
		.orderBy(asc(attendeeIdentities.name))
		.all();
}
