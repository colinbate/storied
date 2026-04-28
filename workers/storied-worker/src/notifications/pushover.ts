import type { PushoverNotificationPayload, WorkerMessage } from '$shared/worker-messages';
import type { HandlerContext } from '../dispatch';
import { generateId } from '../shared/ids';

const PUSHOVER_MESSAGES_URL = 'https://api.pushover.net/1/messages.json';
const MAX_TITLE_LENGTH = 250;
const MAX_MESSAGE_LENGTH = 1024;
const MAX_URL_LENGTH = 512;
const MAX_URL_TITLE_LENGTH = 100;

interface PushoverApiResponse {
	status?: number;
	errors?: string[];
	request?: string;
}

export class RetryablePushoverError extends Error {
	constructor(
		message: string,
		public readonly retryAfterSeconds = 5
	) {
		super(message);
		this.name = 'RetryablePushoverError';
	}
}

export async function queuePushoverMessage(
	env: HandlerContext['env'],
	payload: PushoverNotificationPayload
): Promise<void> {
	if (!env.PUSHOVER_QUEUE) {
		console.log('[PUSHOVER QUEUE DISABLED]', payload.title, payload.message);
		return;
	}

	const message: WorkerMessage = { topic: 'notifications.pushover', payload };
	await env.PUSHOVER_QUEUE.send(message);
}

export async function queuePushoverForRecipients(
	env: HandlerContext['env'],
	recipients: Array<{
		user_id: string;
		pushover_user_key: string;
		pushover_device?: string | null;
	}>,
	message: Omit<PushoverNotificationPayload, 'userId' | 'userKey' | 'device'>
): Promise<void> {
	for (const recipient of recipients) {
		await queuePushoverMessage(env, {
			...message,
			userId: recipient.user_id,
			userKey: recipient.pushover_user_key,
			device: recipient.pushover_device
		});
	}
}

export async function handlePushoverNotification(
	payload: PushoverNotificationPayload,
	{ env }: HandlerContext
): Promise<void> {
	const response = await sendPushover(env, payload);
	const now = new Date().toISOString();

	await env.DB.prepare(
		`INSERT INTO notification_events
		 (id, user_id, event_type, thread_id, post_id, payload_json, status, sent_at, failure_reason, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	)
		.bind(
			generateId(),
			payload.userId,
			payload.eventType ?? 'reply',
			payload.threadId ?? null,
			payload.postId ?? null,
			JSON.stringify({ channel: 'pushover', title: payload.title }),
			response.success ? 'sent' : 'failed',
			response.success ? now : null,
			response.success ? null : response.error,
			now,
			now
		)
		.run();

	if (!response.success && response.retryable) {
		throw new RetryablePushoverError(response.error);
	}
}

async function sendPushover(
	env: HandlerContext['env'],
	payload: PushoverNotificationPayload
): Promise<{ success: true } | { success: false; retryable: boolean; error: string }> {
	if (!env.PUSHOVER_APP_TOKEN) {
		console.log('[PUSHOVER DISABLED]', payload.title, payload.message);
		return { success: true };
	}

	const body: Record<string, string> = {
		token: env.PUSHOVER_APP_TOKEN,
		user: payload.userKey,
		title: truncate(payload.title, MAX_TITLE_LENGTH),
		message: truncate(payload.message, MAX_MESSAGE_LENGTH)
	};
	if (payload.device) body.device = payload.device;
	if (payload.url) body.url = truncate(payload.url, MAX_URL_LENGTH);
	if (payload.urlTitle) body.url_title = truncate(payload.urlTitle, MAX_URL_TITLE_LENGTH);
	if (payload.priority !== undefined) body.priority = String(payload.priority);

	let response: Response;
	try {
		response = await fetch(PUSHOVER_MESSAGES_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
	} catch (err) {
		return {
			success: false,
			retryable: true,
			error: err instanceof Error ? err.message : 'Failed to reach Pushover'
		};
	}

	let result: PushoverApiResponse | null = null;
	try {
		result = (await response.json()) as PushoverApiResponse;
	} catch {
		result = null;
	}

	if (response.ok && result?.status === 1) {
		logLimitHeaders(response);
		return { success: true };
	}

	const errors = result?.errors?.join('; ') || `HTTP ${response.status}`;
	const requestId = result?.request ? ` request=${result.request}` : '';
	const retryable = response.status >= 500 || response.status === 0;
	return { success: false, retryable, error: `${errors}${requestId}` };
}

function truncate(value: string, max: number): string {
	return value.length <= max ? value : value.slice(0, max - 1) + '…';
}

function logLimitHeaders(response: Response): void {
	const remaining = response.headers.get('X-Limit-App-Remaining');
	const reset = response.headers.get('X-Limit-App-Reset');
	if (remaining) {
		console.log(`[PUSHOVER] remaining=${remaining}${reset ? ` reset=${reset}` : ''}`);
	}
}
