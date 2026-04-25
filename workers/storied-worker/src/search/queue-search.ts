import { rebuildSearchIndex, reindexSession, reindexSubject, reindexThread } from '$shared/search';
import type {
	SearchRebuildPayload,
	SearchSessionReindexPayload,
	SearchSubjectReindexPayload,
	SearchThreadReindexPayload
} from '$shared/worker-messages';
import type { HandlerContext } from '../dispatch';

export async function handleSearchThreadReindex(
	payload: SearchThreadReindexPayload,
	context: HandlerContext
): Promise<void> {
	await reindexThread(context.env.DB, payload.threadId);
}

export async function handleSearchSessionReindex(
	payload: SearchSessionReindexPayload,
	context: HandlerContext
): Promise<void> {
	await reindexSession(context.env.DB, payload.sessionId);
}

export async function handleSearchSubjectReindex(
	payload: SearchSubjectReindexPayload,
	context: HandlerContext
): Promise<void> {
	await reindexSubject(context.env.DB, payload.subjectType, payload.subjectId);
}

export async function handleSearchRebuild(
	payload: SearchRebuildPayload,
	context: HandlerContext
): Promise<void> {
	await rebuildSearchIndex(context.env.DB, payload.scope ?? 'all');
}
