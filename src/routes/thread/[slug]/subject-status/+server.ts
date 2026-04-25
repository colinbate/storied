import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { subjectSources, threadSubjects, threads, type SubjectType } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

type SupportedSourceType = 'goodreads' | 'goodreads-series';
type SubjectStatus = 'pending' | 'resolved' | 'failed' | 'unknown';

interface RequestedSource {
	sourceType: SupportedSourceType;
	sourceKey: string;
}

function parseSourceParam(value: string): RequestedSource | null {
	const separator = value.indexOf(':');
	if (separator === -1) return null;

	const sourceType = value.slice(0, separator);
	const sourceKey = value.slice(separator + 1);
	if (
		(sourceType !== 'goodreads' && sourceType !== 'goodreads-series') ||
		sourceKey.trim().length === 0
	) {
		return null;
	}

	return { sourceType, sourceKey };
}

function getStatus(fetchStatus: string, isLinked: boolean): SubjectStatus {
	if (isLinked) return 'resolved';
	if (fetchStatus === 'failed' || fetchStatus === 'ignored') return 'failed';
	return 'pending';
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const thread = await locals.db
		.select({ id: threads.id })
		.from(threads)
		.where(and(eq(threads.slug, params.slug), isNull(threads.deletedAt)))
		.get();

	if (!thread) throw error(404, 'Thread not found');

	const requestedSources = url.searchParams
		.getAll('source')
		.map(parseSourceParam)
		.filter((source): source is RequestedSource => source !== null);

	const uniqueSources = [
		...new Map(
			requestedSources.map((source) => [`${source.sourceType}:${source.sourceKey}`, source])
		).values()
	].slice(0, 20);

	const results = [];
	for (const source of uniqueSources) {
		const subjectSource = await locals.db
			.select()
			.from(subjectSources)
			.where(
				and(
					eq(subjectSources.sourceType, source.sourceType),
					eq(subjectSources.sourceKey, source.sourceKey)
				)
			)
			.get();

		if (!subjectSource) {
			results.push({ ...source, status: 'unknown' satisfies SubjectStatus });
			continue;
		}

		const subjectType = subjectSource.subjectType as SubjectType | null;
		const subjectId = subjectSource.subjectId;
		const linked =
			subjectType && subjectId
				? await locals.db
						.select({ id: threadSubjects.id })
						.from(threadSubjects)
						.where(
							and(
								eq(threadSubjects.threadId, thread.id),
								eq(threadSubjects.subjectType, subjectType),
								eq(threadSubjects.subjectId, subjectId)
							)
						)
						.get()
				: null;

		results.push({
			...source,
			status: getStatus(subjectSource.fetchStatus, !!linked),
			subjectType,
			subjectId
		});
	}

	return json(
		{ sources: results },
		{
			headers: {
				'Cache-Control': 'no-store'
			}
		}
	);
};
