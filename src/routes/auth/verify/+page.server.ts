import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { verifyMagicLink, completeMagicLinkLogin } from '$lib/server/auth';

export const load: PageServerLoad = async ({ url }) => {
	// We deliberately do NOT consume the token here — GET must stay idempotent
	// so email-client prefetchers and anti-malware scanners don't burn links.
	// The actual verification happens in the POST action below, submitted
	// either automatically via JS or via the <noscript> fallback button.
	const token = url.searchParams.get('token');
	if (!token) {
		throw redirect(302, '/auth/login?error=missing_token');
	}
	return { token };
};

export const actions: Actions = {
	default: async ({ request, locals, platform, cookies }) => {
		const data = await request.formData();
		const token = data.get('token')?.toString() ?? '';
		if (!token) {
			return fail(400, { error: 'missing_token' });
		}

		const result = await verifyMagicLink(locals.db, token);
		if (!result) {
			throw redirect(302, '/auth/login?error=invalid_token');
		}

		await completeMagicLinkLogin(locals.db, cookies, platform, result);
	}
};
