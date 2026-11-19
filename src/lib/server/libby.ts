import { and, eq, inArray } from 'drizzle-orm';
import { bookAccessOptions } from '$lib/server/db/schema';
import { isLibbyAccessOption } from '$shared/libby';

export async function loadLibbyBookIds(db: App.Locals['db'], bookIds: string[]) {
	if (!bookIds.length) return new Set<string>();
	const options = await db
		.select()
		.from(bookAccessOptions)
		.where(
			and(inArray(bookAccessOptions.bookId, bookIds), eq(bookAccessOptions.providerType, 'library'))
		)
		.all();
	return new Set(options.filter(isLibbyAccessOption).map((option) => option.bookId));
}
