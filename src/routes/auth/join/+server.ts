import { redirect, type RequestHandler } from '@sveltejs/kit';
import { getSignupMode, startMagicLinkLogin } from '$lib/server/auth';
import { getDisplayNameFromForm, normalizeEmail } from '$lib/server/form-values';

const PUBLIC_JOIN_URL = 'https://bermudatrianglesociety.com/join/';
const APP_LOGIN_URL = '/auth/login';

function redirectToJoin(request: Request, status: 'ok' | 'invalid' = 'ok'): never {
	const referer = request.headers.get('referer');
	const target = referer?.startsWith(PUBLIC_JOIN_URL) ? new URL(referer) : new URL(PUBLIC_JOIN_URL);
	target.searchParams.set('join', status);
	redirect(303, target.toString());
}

function redirectToLogin(email: string): never {
	const target = new URLSearchParams();
	target.set('started', '1');
	target.set('email', email);
	redirect(303, `${APP_LOGIN_URL}?${target.toString()}`);
}

export const POST: RequestHandler = async ({ request, locals, platform, cookies }) => {
	const data = await request.formData();

	// Honeypot used by the public site. Treat filled submissions as successful
	// without creating a pending member.
	if (data.get('phone')?.toString()?.trim()) {
		redirectToJoin(request);
	}

	const email = normalizeEmail(data.get('email'));
	if (!email) {
		redirectToJoin(request, 'invalid');
	}

	const signupMode = getSignupMode(platform?.env.ALLOW_SIGNUP);
	if (signupMode === 'closed') {
		redirectToJoin(request);
	}

	const displayName = getDisplayNameFromForm(data);
	await startMagicLinkLogin({
		db: locals.db,
		platform,
		cookies,
		origin: new URL(request.url).origin,
		email,
		displayName,
		browserTimezone: data.get('browserTimezone')?.toString()?.trim()
	});

	redirectToLogin(email);
};
