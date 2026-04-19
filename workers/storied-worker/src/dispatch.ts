import type { WorkerMessage } from '$shared/worker-messages';
import type { Env } from './env';
import { handleSubjectResolve } from './subject/queue-resolve';
import { handleThreadReplyFanout } from './notifications/queue-thread-reply-fanout';

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
		default: {
			const _exhaustive: never = message;
			throw new Error(`Unknown worker topic: ${JSON.stringify(_exhaustive)}`);
		}
	}
}

export async function dispatchScheduled(cron: string, _context: HandlerContext): Promise<void> {
	// No scheduled handlers registered yet. Planned jobs:
	//   - notifications.digest.daily — fan out daily digests
	//   - maintenance.cleanup.magic-links — prune expired magic links
	//   - maintenance.cleanup.sessions — prune expired auth sessions
	//   - maintenance.repair.book-metadata — refresh stale book metadata
	console.log(`[SCHEDULED] No handler registered for cron: ${cron}`);
}
