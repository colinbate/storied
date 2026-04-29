import type { PageServerLoad } from './$types';
import { users, threads, posts, categories } from '$lib/server/db/schema';
import { count } from 'drizzle-orm';
import type { Actions } from './$types';
import { publishWorkerMessage } from '$lib/server/worker-queue';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	const [userCount] = await locals.db.select({ count: count() }).from(users);
	const [threadCount] = await locals.db.select({ count: count() }).from(threads);
	const [postCount] = await locals.db.select({ count: count() }).from(posts);
	const [categoryCount] = await locals.db.select({ count: count() }).from(categories);

	return {
		stats: {
			users: userCount.count,
			threads: threadCount.count,
			posts: postCount.count,
			categories: categoryCount.count
		}
	};
};

export const actions: Actions = {
	rebuildSearch: async ({ platform, locals }) => {
		if (!locals.permissions.has('search:rebuild')) return { searchRebuildQueued: false };
		await publishWorkerMessage(platform?.env.WORKER_QUEUE, 'search.rebuild', { scope: 'all' });
		return { searchRebuildQueued: true };
	},
	deployStaticSite: async ({ platform, locals }) => {
		if (!locals.permissions.has('static-site:deploy') || locals.user?.role !== 'admin') {
			return fail(403, { staticSiteDeployError: 'Only admins can deploy the static site.' });
		}

		const deployHookUrl = platform?.env.DEPLOY_HOOK_URL?.trim();
		if (!deployHookUrl) {
			return fail(500, {
				staticSiteDeployError: 'Static site deploy hook is not configured.'
			});
		}

		const response = await fetch(deployHookUrl, { method: 'POST' });
		let payload: {
			success?: boolean;
			errors?: unknown[];
			messages?: unknown[];
			result?: {
				build_uuid?: string;
				branch?: string;
				worker?: string;
				already_exists?: boolean;
			};
		} | null = null;

		try {
			payload = await response.json();
		} catch {
			// Cloudflare normally returns JSON, but keep the user-facing error useful if that changes.
		}

		if (!response.ok || payload?.success === false) {
			const errorMessage =
				payload?.errors?.map(String).filter(Boolean).join(' ') ||
				`Cloudflare deploy hook failed with status ${response.status}.`;

			return fail(response.ok ? 502 : response.status, {
				staticSiteDeployError: errorMessage
			});
		}

		return {
			staticSiteDeployQueued: true,
			staticSiteDeployBuildUuid: payload?.result?.build_uuid,
			staticSiteDeployAlreadyExists: !!payload?.result?.already_exists
		};
	}
};
