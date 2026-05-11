import type { WorkerMessage } from '$shared/worker-messages';

export interface Env {
	DB: D1Database;
	EMAIL: SendEmail;
	WORKER_QUEUE?: Queue<WorkerMessage>;
	PUSHOVER_QUEUE?: Queue<WorkerMessage>;
	SEND_EMAILS?: string;
	PUSHOVER_APP_TOKEN?: string;
	/** Base URL (no trailing slash) used when composing links inside emails. */
	DIGEST_BASE_URL?: string;
}
