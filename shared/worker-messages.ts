/**
 * Message contract shared by the SvelteKit producer and the storied-worker
 * consumer. Keep this file dependency-free so both tsconfigs can include it.
 *
 * Add a new background task by:
 *   1. Adding a payload interface below.
 *   2. Extending the `WorkerMessage` union with a new `{ topic, payload }` arm.
 *   3. Registering a handler in workers/storied-worker/src/dispatch.ts.
 */

// ────────────────────────────────────────────────
// Common primitives
// ────────────────────────────────────────────────

export type SubjectSourceType =
	| 'goodreads'
	| 'goodreads-series'
	| 'amazon'
	| 'openlibrary'
	| 'googlebooks'
	| 'manual';

export type SubjectType = 'book' | 'series' | 'author';

// ────────────────────────────────────────────────
// subject.resolve — turn an external URL into a book or series row
// ────────────────────────────────────────────────

export interface SubjectSessionLink {
	sessionId: string;
	status: string;
	note?: string | null;
	addedByUserId?: string | null;
}

/**
 * Auto-link a series_books row once the subject resolves. For a book URL, pass
 * seriesId. For a series URL, pass bookId. The worker fills in the other side
 * from the resolved subject.
 */
export interface SubjectSeriesBookLink {
	seriesId?: string;
	bookId?: string;
	position?: string | null;
	positionSort?: number | null;
}

export interface SubjectResolvePayload {
	subjectSourceId: string;
	sourceType: SubjectSourceType;
	sourceUrl: string;
	sourceKey: string;
	threadId?: string;
	postId?: string;
	sessionLink?: SubjectSessionLink;
	seriesBookLink?: SubjectSeriesBookLink;
}

// ────────────────────────────────────────────────
// notifications.thread-reply — fan out reply emails to subscribers
// ────────────────────────────────────────────────

export interface ThreadReplyFanoutPayload {
	threadId: string;
	postId: string;
	replyAuthorUserId: string;
	/** Origin used to build absolute links in the email (e.g. https://discuss…). */
	baseUrl: string;
}

// ────────────────────────────────────────────────
// Discriminated union
// ────────────────────────────────────────────────

export type WorkerMessage =
	| { topic: 'subject.resolve'; payload: SubjectResolvePayload }
	| { topic: 'notifications.thread-reply'; payload: ThreadReplyFanoutPayload };

export type WorkerTopic = WorkerMessage['topic'];

export type WorkerPayload<T extends WorkerTopic> = Extract<WorkerMessage, { topic: T }>['payload'];
