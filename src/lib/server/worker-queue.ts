import type { WorkerMessage, WorkerTopic, WorkerPayload } from '$shared/worker-messages';

/** Minimal shape we care about from platform.env.STORIED_WORKER. */
export interface WorkerServiceBinding {
	send: (message: WorkerMessage) => Promise<void>;
}

/**
 * Publish a typed message to the worker service. No-op when the binding is
 * unavailable (e.g. during SSR in environments without the Cloudflare runtime).
 */
export async function publishWorkerMessage<T extends WorkerTopic>(
	service: WorkerServiceBinding | null | undefined,
	topic: T,
	payload: WorkerPayload<T>
): Promise<void> {
	if (!service) return;
	await service.send({ topic, payload } as WorkerMessage);
}
