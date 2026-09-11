import { and, asc, eq, sql } from 'drizzle-orm';

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

	const rows = await db.all<{ subjectId: string } & ClassificationDisplay>(sql`
		SELECT
			subject_classifications.subject_id AS subjectId,
			classifications.id,
			classifications.slug,
			classifications.name,
			classifications.description,
			classifications.icon
		FROM subject_classifications
		INNER JOIN classifications
			ON subject_classifications.classification_id = classifications.id
		INNER JOIN json_each(${JSON.stringify([...new Set(subjectIds)])}) requested_subject
			ON requested_subject.value = subject_classifications.subject_id
		WHERE subject_classifications.subject_type = ${subjectType}
		ORDER BY classifications.display_order, classifications.name
	`);

	for (const row of rows) {
		const { subjectId, ...classification } = row;
		(result[subjectId] ??= []).push(classification);
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
		? await db.all<{ id: number }>(sql`
				SELECT classifications.id
				FROM classifications
				INNER JOIN json_each(${JSON.stringify(uniqueIds)}) requested_classification
					ON requested_classification.value = classifications.id
			`)
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
