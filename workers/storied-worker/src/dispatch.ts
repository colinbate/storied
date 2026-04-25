import type { WorkerMessage } from '$shared/worker-messages';
import type { Env } from './env';
import { handleSubjectResolve } from './subject/queue-resolve';
import { handleNewThreadFanout } from './notifications/queue-new-thread-fanout';
import { handleThreadReplyFanout } from './notifications/queue-thread-reply-fanout';
import { runDailyDigest } from './notifications/scheduled-digest';
import {
	handleSearchRebuild,
	handleSearchSessionReindex,
	handleSearchSubjectReindex,
	handleSearchThreadReindex
} from './search/queue-search';

export interface HandlerContext {
	env: Env;
	ctx: ExecutionContext;
}

export async function dispatchWorkerMessage(
	message: WorkerMessage,
	context: HandlerContext
): Promise<void> {
	switch (message.topic) {
		case 'subject.resolve':
			await handleSubjectResolve(message.payload, context);
			return;
		case 'notifications.thread-reply':
			await handleThreadReplyFanout(message.payload, context);
			return;
		case 'notifications.new-thread':
			await handleNewThreadFanout(message.payload, context);
			return;
		case 'search.thread.reindex':
			await handleSearchThreadReindex(message.payload, context);
			return;
		case 'search.session.reindex':
			await handleSearchSessionReindex(message.payload, context);
			return;
		case 'search.subject.reindex':
			await handleSearchSubjectReindex(message.payload, context);
			return;
		case 'search.rebuild':
			await handleSearchRebuild(message.payload, context);
			return;
		default: {
			const _exhaustive: never = message;
			throw new Error(`Unknown worker topic: ${JSON.stringify(_exhaustive)}`);
		}
	}
}

export async function dispatchScheduled(cron: string, context: HandlerContext): Promise<void> {
	// Hourly cron drives the digest scheduler. The handler itself filters
	// users down to those whose local digest hour matches the current hour
	// in their timezone, so other crons can be added later without touching
	// the digest code.
	if (cron === '0 * * * *') {
		await runDailyDigest(context);
		return;
	}
	console.log(`[SCHEDULED] No handler registered for cron: ${cron}`);
}
