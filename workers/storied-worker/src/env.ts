export interface Env {
	DB: D1Database;
	EMAIL: SendEmail;
	SEND_EMAILS?: string;
	/** Base URL (no trailing slash) used when composing links inside emails. */
	DIGEST_BASE_URL?: string;
}
