import type { ORM } from '$lib/server/db';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			db: ORM;
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
