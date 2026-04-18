import { and, eq } from 'drizzle-orm';
import type { ORM } from './db';
import { subjectSources, threadSubjects, sessionSubjects, seriesBooks } from './db/schema';
import { newId } from './ids';
import { detectSubjectLinks, type DetectedSubjectLink } from './book-links';

// Match the worker's queue message shape.
export interface SubjectQueueMessage {
	subjectSourceId: string;
	sourceType: string;
	sourceUrl: string;
	sourceKey: string;
	threadId?: string;
	postId?: string;
	sessionLink?: {
		sessionId: string;
		status: string;
		note?: string | null;
		addedByUserId?: string | null;
	};
	/**
	 * Auto-link a series_books row once the subject resolves. For a book URL, pass
	 * seriesId. For a series URL, pass bookId. The worker fills in the other side
	 * from the resolved subject.
	 */
	seriesBookLink?: {
		seriesId?: string;
		bookId?: string;
		position?: string | null;
		positionSort?: number | null;
	};
}

// Bindings we expect on platform.env (subset of Cloudflare.Env).
export interface SubjectQueueBinding {
	SUBJECT_QUEUE?: { send: (msg: SubjectQueueMessage) => Promise<void> } | null;
}

export interface ResolveOrEnqueueResult {
	sourceId: string;
	resolvedSubjectType: 'book' | 'series' | null;
	resolvedSubjectId: string | null;
	alreadyExisted: boolean;
}

/**
 * Given a detected URL link, ensure a subject_sources row exists and enqueue
 * a resolution message. If the source is already resolved, no enqueue happens.
 *
 * Optional sideEffects for thread/session linking are forwarded to the worker
 * queue message so it can attach once the subject resolves.
 */
export async function ensureSubjectSource(
	db: ORM,
	link: DetectedSubjectLink,
	env: SubjectQueueBinding | undefined,
	sideEffects: {
		threadId?: string;
		postId?: string;
		sessionLink?: SubjectQueueMessage['sessionLink'];
		seriesBookLink?: SubjectQueueMessage['seriesBookLink'];
	} = {}
): Promise<ResolveOrEnqueueResult> {
	const existing = await db
		.select()
		.from(subjectSources)
		.where(
			and(
				eq(subjectSources.sourceType, link.sourceType),
				eq(subjectSources.sourceKey, link.sourceKey)
			)
		)
		.get();

	let sourceId: string;
	let resolvedSubjectType: 'book' | 'series' | null = null;
	let resolvedSubjectId: string | null = null;
	let alreadyExisted = false;

	if (existing) {
		alreadyExisted = true;
		sourceId = existing.id;
		resolvedSubjectType = (existing.subjectType as 'book' | 'series' | null) ?? null;
		resolvedSubjectId = existing.subjectId;
	} else {
		sourceId = newId();
		await db.insert(subjectSources).values({
			id: sourceId,
			sourceType: link.sourceType,
			sourceUrl: link.url,
			sourceKey: link.sourceKey,
			fetchStatus: 'pending'
		});
	}

	// If not yet resolved, enqueue (or re-enqueue) for the worker.
	if (!resolvedSubjectId && env?.SUBJECT_QUEUE) {
		await env.SUBJECT_QUEUE.send({
			subjectSourceId: sourceId,
			sourceType: link.sourceType,
			sourceUrl: link.url,
			sourceKey: link.sourceKey,
			threadId: sideEffects.threadId,
			postId: sideEffects.postId,
			sessionLink: sideEffects.sessionLink,
			seriesBookLink: sideEffects.seriesBookLink
		});
	}

	// If already resolved, perform the side-effect linking now.
	if (resolvedSubjectType && resolvedSubjectId) {
		if (sideEffects.threadId) {
			await db
				.insert(threadSubjects)
				.values({
					id: newId(),
					threadId: sideEffects.threadId,
					postId: sideEffects.postId ?? null,
					subjectType: resolvedSubjectType,
					subjectId: resolvedSubjectId,
					displayOrder: 0,
					context: 'linked',
					addedBy: null
				})
				.onConflictDoNothing();
		}
		if (sideEffects.sessionLink) {
			await db
				.insert(sessionSubjects)
				.values({
					sessionId: sideEffects.sessionLink.sessionId,
					subjectType: resolvedSubjectType,
					subjectId: resolvedSubjectId,
					status: sideEffects.sessionLink.status,
					note: sideEffects.sessionLink.note ?? null,
					addedByUserId: sideEffects.sessionLink.addedByUserId ?? null
				})
				.onConflictDoNothing();
		}
		if (sideEffects.seriesBookLink) {
			let seriesId: string | undefined;
			let bookId: string | undefined;
			if (resolvedSubjectType === 'book') {
				seriesId = sideEffects.seriesBookLink.seriesId;
				bookId = resolvedSubjectId;
			} else if (resolvedSubjectType === 'series') {
				seriesId = resolvedSubjectId;
				bookId = sideEffects.seriesBookLink.bookId;
			}
			if (seriesId && bookId) {
				await db
					.insert(seriesBooks)
					.values({
						seriesId,
						bookId,
						position: sideEffects.seriesBookLink.position ?? null,
						positionSort: sideEffects.seriesBookLink.positionSort ?? null
					})
					.onConflictDoNothing();
			}
		}
	}

	return { sourceId, resolvedSubjectType, resolvedSubjectId, alreadyExisted };
}

/**
 * Detect the first supported subject link in the provided text.
 * Returns null if no match. Used by admin forms that accept a URL.
 */
export function detectFirstSubjectLink(text: string): DetectedSubjectLink | null {
	const links = detectSubjectLinks(text);
	return links[0] ?? null;
}

/**
 * Detect a link, requiring it to be of a specific kind ('book' or 'series').
 */
export function detectFirstSubjectLinkOfKind(
	text: string,
	kind: 'book' | 'series'
): DetectedSubjectLink | null {
	const links = detectSubjectLinks(text);
	return links.find((l) => l.subjectKind === kind) ?? null;
}
