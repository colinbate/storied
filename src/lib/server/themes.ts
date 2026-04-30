import { asc, eq } from 'drizzle-orm';
import type { ORM } from './db';
import { themes, type ThemeStatus } from './db/schema';
import { newId } from './ids';
import { normalizeSlug } from './slugify';

export const THEME_STATUSES: ThemeStatus[] = ['idea', 'shortlist', 'selected', 'archived'];

export function isThemeStatus(value: unknown): value is ThemeStatus {
	return typeof value === 'string' && (THEME_STATUSES as string[]).includes(value);
}

export function getThemeStatus(value: FormDataEntryValue | null): ThemeStatus {
	const status = value?.toString();
	return isThemeStatus(status) ? status : 'idea';
}

async function uniqueThemeSlug(db: ORM, name: string): Promise<string> {
	const baseSlug = normalizeSlug(name);
	if (!baseSlug) return newId();

	let slug = baseSlug;
	let attempt = 1;
	while (true) {
		const existing = await db
			.select({ id: themes.id })
			.from(themes)
			.where(eq(themes.slug, slug))
			.get();
		if (!existing) return slug;
		attempt += 1;
		slug = `${baseSlug}-${attempt}`;
	}
}

export async function listThemes(db: ORM) {
	return await db.select().from(themes).orderBy(asc(themes.name)).all();
}

export interface CreateThemeInput {
	name: string;
	description?: string | null;
	exampleText?: string | null;
	status?: ThemeStatus;
	submittedByUserId?: string | null;
}

export async function createTheme(db: ORM, input: CreateThemeInput) {
	const now = new Date().toISOString();
	const status = input.status ?? 'idea';
	const row: typeof themes.$inferInsert = {
		id: newId(),
		slug: await uniqueThemeSlug(db, input.name),
		name: input.name,
		description: input.description ?? null,
		exampleText: input.exampleText ?? null,
		status,
		submittedByUserId: input.submittedByUserId ?? null,
		selectedAt: status === 'selected' ? now : null,
		archivedAt: status === 'archived' ? now : null,
		updatedAt: now
	};

	await db.insert(themes).values(row);
	return row;
}

export async function selectThemeForSession(db: ORM, themeId: string) {
	const theme = await db.select().from(themes).where(eq(themes.id, themeId)).get();
	if (!theme) return null;

	if (theme.status !== 'selected') {
		await db
			.update(themes)
			.set({
				status: 'selected',
				selectedAt: theme.selectedAt ?? new Date().toISOString(),
				archivedAt: null,
				updatedAt: new Date().toISOString()
			})
			.where(eq(themes.id, theme.id));
	}

	return theme;
}

export interface ResolveSessionThemeInput {
	themeId?: string | null;
}

export async function resolveSessionTheme(db: ORM, input: ResolveSessionThemeInput) {
	const themeId = input.themeId?.trim();
	if (!themeId) return { themeId: null, themeName: null };

	const theme = await selectThemeForSession(db, themeId);
	return theme ? { themeId: theme.id, themeName: theme.name } : { themeId: null, themeName: null };
}
