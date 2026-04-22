import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	createMagicLink,
	verifyMagicLinkCode,
	completeMagicLinkLogin,
	REDIR_COOKIE_NAME,
	TIMEZONE_COOKIE_NAME,
	TIMEZONE_COOKIE_MAX_AGE_S,
	INVITE_COOKIE_NAME,
	getSignupMode,
	getValidInviteForEmail
} from '$lib/server/auth';
import { isValidTimezone } from '$lib/server/notification-preferences';
import { sendMagicLinkEmail } from '$lib/server/email';

export const load: PageServerLoad = async ({ locals, url, platform }) => {
	if (locals.user) {
		throw redirect(302, '/');
	}
	const error = url.searchParams.get('error');
	const signupMode = getSignupMode(platform?.env.ALLOW_SIGNUP);
	const invite = url.searchParams.get('invite')?.trim() ?? '';
	return {
		error,
		signupMode,
		canSignup: signupMode !== 'closed',
		invite
	};
};

function normalizeEmail(raw: FormDataEntryValue | null): string | null {
	const email = raw?.toString()?.trim()?.toLowerCase();
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
	return email;
}

export const actions: Actions = {
	login: async ({ request, locals, platform, url, cookies }) => {
		const data = await request.formData();
		const rawEmail = data.get('email');
		const email = normalizeEmail(rawEmail);
		const inviteCode = data.get('invite')?.toString()?.trim() ?? '';

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

		if (inviteCode) {
			const invite = await getValidInviteForEmail(locals.db, inviteCode, email);
			if (!invite) {
				return fail(400, {
					error: 'That invitation is invalid, expired, or for a different email address.',
					email
				});
			}
			cookies.set(INVITE_COOKIE_NAME, inviteCode, {
				path: '/',
				httpOnly: true,
				secure: true,
				sameSite: 'lax',
				maxAge: TIMEZONE_COOKIE_MAX_AGE_S
			});
		} else {
			cookies.delete(INVITE_COOKIE_NAME, { path: '/' });
		}

		// Stash the browser-detected timezone in a short-lived cookie so the
		// magic-link verify handler can apply it when creating a brand-new user.
		// Safe to skip if missing or invalid — the users.timezone default kicks in.
		const browserTimezone = data.get('browserTimezone')?.toString()?.trim();
		if (browserTimezone && isValidTimezone(browserTimezone)) {
			cookies.set(TIMEZONE_COOKIE_NAME, browserTimezone, {
				path: '/',
				httpOnly: true,
				secure: true,
				sameSite: 'lax',
				maxAge: TIMEZONE_COOKIE_MAX_AGE_S
			});
		} else {
			cookies.delete(TIMEZONE_COOKIE_NAME, { path: '/' });
		}

		try {
			const { token, code } = await createMagicLink(locals.db, email);
			if (platform) {
				await sendMagicLinkEmail(platform, email, token, code, url.origin);
			}
		} catch (err) {
			console.error('Magic link error:', err);
			// Don't reveal errors to the user for security
		}

		return { success: true, email };
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
