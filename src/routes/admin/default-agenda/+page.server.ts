import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requirePermission } from '$lib/server/auth';
import {
	createDefaultAgendaItem,
	deleteDefaultAgendaItem,
	isAgendaVisibility,
	listDefaultAgenda,
	reorderDefaultAgenda,
	updateDefaultAgendaItem
} from '$lib/server/session-workflow';

function text(data: FormData, key: string) {
	return data.get(key)?.toString().trim() || null;
}

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals, 'sessions:edit');
	return { items: await listDefaultAgenda(locals.db) };
};

export const actions: Actions = {
	createAgendaItem: async ({ locals, request }) => {
		requirePermission(locals, 'sessions:edit');
		const data = await request.formData();
		const title = text(data, 'title');
		if (!title) return fail(400, { error: 'Enter a title.' });
		const visibility = text(data, 'visibility');
		await createDefaultAgendaItem(locals.db, {
			title,
			description: text(data, 'description'),
			visibility: isAgendaVisibility(visibility) ? visibility : 'members'
		});
		return { saved: true };
	},

	updateAgendaItem: async ({ locals, request }) => {
		requirePermission(locals, 'sessions:edit');
		const data = await request.formData();
		const id = text(data, 'itemId');
		const title = text(data, 'title');
		if (!id || !title) return fail(400, { error: 'Enter a title.' });
		const visibility = text(data, 'visibility');
		await updateDefaultAgendaItem(locals.db, id, {
			title,
			description: text(data, 'description'),
			visibility: isAgendaVisibility(visibility) ? visibility : 'members'
		});
		return { saved: true };
	},

	deleteAgendaItem: async ({ locals, request }) => {
		requirePermission(locals, 'sessions:edit');
		const id = text(await request.formData(), 'itemId');
		if (!id) return fail(400, { error: 'Missing item.' });
		await deleteDefaultAgendaItem(locals.db, id);
		return { saved: true };
	},

	moveAgendaItem: async ({ locals, request }) => {
		requirePermission(locals, 'sessions:edit');
		const data = await request.formData();
		const id = text(data, 'itemId');
		const direction = text(data, 'direction');
		if (!id || (direction !== 'up' && direction !== 'down')) {
			return fail(400, { error: 'Invalid move.' });
		}
		const ids = (await listDefaultAgenda(locals.db)).map((item) => item.id);
		const index = ids.indexOf(id);
		const target = direction === 'up' ? index - 1 : index + 1;
		if (index === -1 || target < 0 || target >= ids.length) return { saved: true };
		[ids[index], ids[target]] = [ids[target], ids[index]];
		await reorderDefaultAgenda(locals.db, ids);
		return { saved: true };
	},

	reorderAgenda: async ({ locals, request }) => {
		requirePermission(locals, 'sessions:edit');
		const ids = (await request.formData()).getAll('itemId').map(String).filter(Boolean);
		if (ids.length === 0) return fail(400, { error: 'Nothing to reorder.' });
		await reorderDefaultAgenda(locals.db, ids);
		return { saved: true };
	}
};
