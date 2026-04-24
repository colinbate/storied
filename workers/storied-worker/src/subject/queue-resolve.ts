import type { SubjectResolvePayload, SubjectType } from '$shared/worker-messages';
import type { HandlerContext } from '../dispatch';
import {
	linkThreadSubject,
	linkSessionSubject,
	linkSeriesBook,
	linkUserFeaturedSubject,
	markSourceFailed
} from './links';
import { resolveGoodreadsBook } from './resolve-book';
import { resolveGoodreadsSeries } from './resolve-series';

export async function handleSubjectResolve(
	payload: SubjectResolvePayload,
	{ env }: HandlerContext
): Promise<void> {
	const {
		subjectSourceId,
		sourceType,
		threadId,
		postId,
		sessionLink,
		seriesBookLink,
		userFeatureLink
	} = payload;

	const source = await env.DB.prepare(
		`SELECT id, fetch_status, subject_type, subject_id FROM subject_sources WHERE id = ?`
	)
		.bind(subjectSourceId)
		.first<{
			id: string;
			fetch_status: string;
			subject_type: string | null;
			subject_id: string | null;
		}>();

	if (!source) {
		console.log(`[RESOLVER] Source ${subjectSourceId} not found, skipping`);
		return;
	}

	// Already resolved — just link any pending side-effects.
	if (source.fetch_status === 'resolved' && source.subject_type && source.subject_id) {
		const resolvedType = source.subject_type as SubjectType;
		await linkThreadSubject(env.DB, resolvedType, source.subject_id, threadId, postId);
		await linkSessionSubject(env.DB, resolvedType, source.subject_id, sessionLink);
		await linkSeriesBook(env.DB, resolvedType, source.subject_id, seriesBookLink);
		await linkUserFeaturedSubject(env.DB, resolvedType, source.subject_id, userFeatureLink);
		return;
	}

	switch (sourceType) {
		case 'goodreads':
			await resolveGoodreadsBook(payload, env);
			return;
		case 'goodreads-series':
			await resolveGoodreadsSeries(payload, env);
			return;
		default:
			console.log(`[RESOLVER] Unsupported source type: ${sourceType}`);
			await markSourceFailed(env.DB, subjectSourceId);
			return;
	}
}
