import { fail, redirect } from '@sveltejs/kit';
import { and, eq, gt } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import {
	completeMagicLinkLogin,
	hashToken,
	SIGNUP_NAME_COOKIE_NAME,
	SIGNUP_TICKET_COOKIE_NAME,
	TIMEZONE_COOKIE_NAME,
	TIMEZONE_COOKIE_MAX_AGE_S
} from '$lib/server/auth';
import { signupTickets } from '$lib/server/db/schema';
import { normalizeDisplayName } from '$lib/server/form-values';

async function ticketCondition(cookies: Parameters<PageServerLoad>[0]['cookies']) {
	const token = cookies.get(SIGNUP_TICKET_COOKIE_NAME);
	if (!token) redirect(303, '/auth/login?error=introduction_expired');
	return and(
		eq(signupTickets.tokenHash, await hashToken(token)),
		gt(signupTickets.expiresAt, new Date().toISOString())
	);
}

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const ticket = await locals.db
		.select()
		.from(signupTickets)
		.where(await ticketCondition(cookies))
		.get();
	if (!ticket) redirect(303, '/auth/login?error=introduction_expired');
	return { email: ticket.email, displayName: ticket.displayName ?? '' };
};

export const actions: Actions = {
	default: async ({ request, locals, cookies, platform }) => {
		const data = await request.formData();
		const displayName = normalizeDisplayName(data.get('displayName'));
		const introduction = data.get('introduction')?.toString().replace(/\r\n?/g, '\n').trim() ?? '';
		const condition = await ticketCondition(cookies);
		const ticket = await locals.db.select().from(signupTickets).where(condition).get();
		if (!ticket) redirect(303, '/auth/login?error=introduction_expired');
		if (!displayName || !introduction || introduction.length > 2000) {
			return fail(400, {
				error: !displayName
					? 'Please enter your name.'
					: !introduction
						? 'Please write a short introduction for the archivist.'
						: 'Please keep your introduction to 2,000 characters or fewer.',
				displayName: displayName ?? '',
				introduction
			});
		}
		// Consume once, only after validation. Replays cannot create another request.
		const consumed = await locals.db.delete(signupTickets).where(condition).returning();
		if (!consumed.length) redirect(303, '/auth/login?error=introduction_expired');
		cookies.delete(SIGNUP_TICKET_COOKIE_NAME, { path: '/auth/introduction' });
		const options = {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax' as const,
			maxAge: TIMEZONE_COOKIE_MAX_AGE_S
		};
		cookies.set(SIGNUP_NAME_COOKIE_NAME, displayName, options);
		if (ticket.timezone) cookies.set(TIMEZONE_COOKIE_NAME, ticket.timezone, options);
		await completeMagicLinkLogin(
			locals.db,
			cookies,
			platform,
			{ email: ticket.email, userId: null },
			introduction
		);
	}
};
