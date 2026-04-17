import type { ORM } from '$lib/server/db';
import type { users } from '$lib/server/db/schema';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			db: ORM;
			user: typeof users.$inferSelect | null;
			sessionId: string | null;
			permissions: Set<string>;
		}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env: Env;
			cf: CfProperties;
			ctx: ExecutionContext;
		}
	}
}

export {};
