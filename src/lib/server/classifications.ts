import { and, asc, eq, inArray } from 'drizzle-orm';

import { classifications, subjectClassifications, type SubjectType } from '$lib/server/db/schema';

export type ClassificationDisplay = {
	id: number;
	slug: string;
	name: string;
	description: string | null;
	icon: string;
};

type ClassifiableSubjectType = Extract<SubjectType, 'book' | 'series'>;

export async function loadClassificationEditor(
	db: App.Locals['db'],
	subjectType: ClassifiableSubjectType,
	subjectId: string
) {
	const [allClassifications, assignedRows] = await Promise.all([
		db
			.select()
			.from(classifications)
			.orderBy(asc(classifications.displayOrder), asc(classifications.name))
			.all(),
		db
			.select({ classificationId: subjectClassifications.classificationId })
			.from(subjectClassifications)
			.where(
				and(
					eq(subjectClassifications.subjectType, subjectType),
					eq(subjectClassifications.subjectId, subjectId)
				)
			)
			.all()
	]);

	return {
		allClassifications,
		assignedClassificationIds: assignedRows.map((row) => row.classificationId)
	};
}

export async function loadClassificationsBySubject(
	db: App.Locals['db'],
	subjectType: ClassifiableSubjectType,
	subjectIds: string[]
) {
	const result: Record<string, ClassificationDisplay[]> = {};
	if (!subjectIds.length) return result;

	// Keep each query comfortably below SQLite/D1 parameter limits for large libraries.
	const uniqueSubjectIds = [...new Set(subjectIds)];
	for (let offset = 0; offset < uniqueSubjectIds.length; offset += 90) {
		const chunk = uniqueSubjectIds.slice(offset, offset + 90);
		const rows = await db
			.select({ subjectId: subjectClassifications.subjectId, classification: classifications })
			.from(subjectClassifications)
			.innerJoin(classifications, eq(subjectClassifications.classificationId, classifications.id))
			.where(
				and(
					eq(subjectClassifications.subjectType, subjectType),
					inArray(subjectClassifications.subjectId, chunk)
				)
			)
			.orderBy(asc(classifications.displayOrder), asc(classifications.name))
			.all();

		for (const row of rows) {
			(result[row.subjectId] ??= []).push(row.classification);
		}
	}
	return result;
}

export async function replaceSubjectClassifications(
	db: App.Locals['db'],
	subjectType: ClassifiableSubjectType,
	subjectId: string,
	requestedIds: number[]
) {
	const uniqueIds = [...new Set(requestedIds.filter((id) => Number.isInteger(id) && id > 0))];
	const validRows = uniqueIds.length
		? await db
				.select({ id: classifications.id })
				.from(classifications)
				.where(inArray(classifications.id, uniqueIds))
				.all()
		: [];

	await db.batch([
		db
			.delete(subjectClassifications)
			.where(
				and(
					eq(subjectClassifications.subjectType, subjectType),
					eq(subjectClassifications.subjectId, subjectId)
				)
			),
		...validRows.map((row) =>
			db.insert(subjectClassifications).values({
				classificationId: row.id,
				subjectType,
				subjectId
			})
		)
	]);
}

export function classificationIdsFromForm(data: FormData) {
	return data
		.getAll('classificationIds')
		.map((value) => Number(value))
		.filter((value) => Number.isInteger(value) && value > 0);
}
