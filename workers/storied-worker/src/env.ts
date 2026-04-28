export interface Env {
	DB: D1Database;
	EMAIL: SendEmail;
	PUSHOVER_QUEUE?: Queue;
	SEND_EMAILS?: string;
	PUSHOVER_APP_TOKEN?: string;
	/** Base URL (no trailing slash) used when composing links inside emails. */
	DIGEST_BASE_URL?: string;
}
