import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	verifyMagicLinkCode,
	completeMagicLinkLogin,
	REDIR_COOKIE_NAME,
	getSignupMode,
	startMagicLinkLogin
} from '$lib/server/auth';
import { getDisplayNameFromForm, normalizeEmail } from '$lib/server/form-values';

export const load: PageServerLoad = async ({ locals, url, platform }) => {
	if (locals.user) {
		throw redirect(302, '/');
	}
	const error = url.searchParams.get('error');
	const signupMode = getSignupMode(platform?.env.ALLOW_SIGNUP);
	const invite = url.searchParams.get('invite')?.trim() ?? '';
	const startedEmail =
		url.searchParams.get('started') === '1' ? normalizeEmail(url.searchParams.get('email')) : null;
	return {
		error,
		signupMode,
		canSignup: signupMode !== 'closed',
		invite,
		startedEmail
	};
};

export const actions: Actions = {
	login: async ({ request, locals, platform, url, cookies }) => {
		const data = await request.formData();
		const rawEmail = data.get('email');
		const email = normalizeEmail(rawEmail);
		const inviteCode = data.get('invite')?.toString()?.trim() ?? '';
		const displayName = getDisplayNameFromForm(data);
		const phone = data.get('phone')?.toString()?.trim() ?? '';

		if (!email) {
			return fail(400, {
				error: 'Please enter a valid email address.',
				email: rawEmail?.toString() ?? ''
			});
		}

		const redir = url.searchParams.get('redirect');
		if (redir && redir.startsWith('/')) {
			cookies.set(REDIR_COOKIE_NAME, redir, { path: '/' });
		} else {
			cookies.delete(REDIR_COOKIE_NAME, { path: '/' });
		}

		if (phone) {
			return { success: true, email };
		}

		const result = await startMagicLinkLogin({
			db: locals.db,
			platform,
			cookies,
			origin: url.origin,
			email,
			inviteCode,
			displayName,
			browserTimezone: data.get('browserTimezone')?.toString()?.trim()
		});

		if (!result.ok) {
			return fail(400, {
				error: result.error,
				email: result.email
			});
		}

		return { success: true, email: result.email };
	},

	code: async ({ request, locals, platform, cookies }) => {
		const data = await request.formData();
		const rawEmail = data.get('email');
		const email = normalizeEmail(rawEmail);
		const code = data.get('code')?.toString()?.replace(/\s+/g, '') ?? '';

		if (!email) {
			return fail(400, {
				codeError: 'Please enter a valid email address.',
				email: rawEmail?.toString() ?? '',
				success: true
			});
		}
		if (!/^\d{6}$/.test(code)) {
			return fail(400, {
				codeError: 'Enter the 6-digit code from the email.',
				email,
				success: true
			});
		}

		const result = await verifyMagicLinkCode(locals.db, email, code);

		if ('error' in result) {
			const msg =
				result.error === 'locked'
					? 'Too many incorrect attempts. Request a new code.'
					: 'That code is incorrect or expired.';
			return fail(400, { codeError: msg, email, success: true });
		}

		await completeMagicLinkLogin(locals.db, cookies, platform, result);
	}
};
