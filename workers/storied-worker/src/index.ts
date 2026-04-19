import type { WorkerMessage } from '$shared/worker-messages';
import type { Env } from './env';
import { dispatchWorkerMessage, dispatchScheduled } from './dispatch';
import { handleFetchTestRoute } from './test/routes';

export default {
	async queue(batch: MessageBatch<WorkerMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
		console.log(`[WORKER] Processing batch of ${batch.messages.length} message(s)`);
		for (const message of batch.messages) {
			try {
				await dispatchWorkerMessage(message.body, { env, ctx });
				message.ack();
			} catch (err) {
				const topic = (message.body as { topic?: string } | null)?.topic ?? '<unknown>';
				console.error(`[WORKER] Handler error for topic=${topic}:`, err);
				message.retry();
			}
		}
	},

	async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		await dispatchScheduled(event.cron, { env, ctx });
	},

	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const testResponse = await handleFetchTestRoute(request, url, env, ctx);
		if (testResponse) return testResponse;
		return new Response(JSON.stringify({ status: 'ok', worker: 'storied-worker' }), {
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
