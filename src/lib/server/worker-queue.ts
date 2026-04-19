import type { WorkerMessage, WorkerTopic, WorkerPayload } from '$shared/worker-messages';

/** Minimal shape we care about from platform.env.WORKER_QUEUE. */
export interface WorkerQueueBinding {
	send: (message: WorkerMessage) => Promise<void>;
}

/**
 * Publish a typed message to the worker queue. No-op when the binding is
 * unavailable (e.g. during SSR in environments without the Cloudflare runtime).
 */
export async function publishWorkerMessage<T extends WorkerTopic>(
	queue: WorkerQueueBinding | null | undefined,
	topic: T,
	payload: WorkerPayload<T>
): Promise<void> {
	if (!queue) return;
	await queue.send({ topic, payload } as WorkerMessage);
}
