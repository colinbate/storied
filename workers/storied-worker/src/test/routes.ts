import type { WorkerMessage, SubjectSourceType } from '$shared/worker-messages';
import type { Env } from '../env';
import { dispatchWorkerMessage, dispatchScheduled } from '../dispatch';

/**
 * Test-only HTTP endpoints. The worker has no public route in production
 * (workers_dev = false) so these are only reachable via `wrangler dev`.
 *
 *   POST /test/queue          body: WorkerMessage      — run a queue handler
 *   POST /test/cron?cron=…                             — run the scheduled dispatcher
 *   GET  /resolve?id=&thread=&post=                     — shortcut for subject.resolve
 *   GET  /                                              — health
 */
export async function handleFetchTestRoute(
	request: Request,
	url: URL,
	env: Env,
	ctx: ExecutionContext
): Promise<Response | null> {
	if (url.pathname === '/test/queue' && request.method === 'POST') {
		let message: WorkerMessage;
		try {
			message = (await request.json()) as WorkerMessage;
		} catch {
			return json({ error: 'Invalid JSON body' }, 400);
		}
		try {
			await dispatchWorkerMessage(message, { env, ctx });
			return json({ ok: true });
		} catch (err) {
			return json({ ok: false, error: errMessage(err) }, 500);
		}
	}

	if (url.pathname === '/test/cron' && request.method === 'POST') {
		const cron = url.searchParams.get('cron');
		if (!cron) return json({ error: 'Missing ?cron= parameter' }, 400);
		try {
			await dispatchScheduled(cron, { env, ctx });
			return json({ ok: true });
		} catch (err) {
			return json({ ok: false, error: errMessage(err) }, 500);
		}
	}

	if (url.pathname === '/resolve' && request.method === 'GET') {
		const subjectSourceId = url.searchParams.get('id');
		if (!subjectSourceId) return json({ error: 'Missing ?id= parameter' }, 400);

		const source = await env.DB.prepare(
			`SELECT id, source_type, source_url, source_key FROM subject_sources WHERE id = ?`
		)
			.bind(subjectSourceId)
			.first<{ id: string; source_type: string; source_url: string; source_key: string }>();
		if (!source) return json({ error: 'Source not found' }, 404);

		const message: WorkerMessage = {
			topic: 'subject.resolve',
			payload: {
				subjectSourceId: source.id,
				sourceType: source.source_type as SubjectSourceType,
				sourceUrl: source.source_url,
				sourceKey: source.source_key,
				threadId: url.searchParams.get('thread') ?? undefined,
				postId: url.searchParams.get('post') ?? undefined
			}
		};
		try {
			await dispatchWorkerMessage(message, { env, ctx });
			return json({ ok: true });
		} catch (err) {
			return json({ ok: false, error: errMessage(err) }, 500);
		}
	}

	return null;
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function errMessage(err: unknown): string {
	return err instanceof Error ? err.message : 'Unknown error';
}
