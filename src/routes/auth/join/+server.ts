import { redirect, type RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { findOrCreateUser, getSignupMode } from '$lib/server/auth';
import { users } from '$lib/server/db/schema';
import { getDisplayNameFromForm, normalizeEmail } from '$lib/server/form-values';

const PUBLIC_JOIN_URL = 'https://bermudatrianglesociety.com/join/';

function redirectToJoin(request: Request, status: 'ok' | 'invalid' = 'ok'): never {
	const referer = request.headers.get('referer');
	const target = referer?.startsWith(PUBLIC_JOIN_URL) ? new URL(referer) : new URL(PUBLIC_JOIN_URL);
	target.searchParams.set('join', status);
	redirect(303, target.toString());
}

export const POST: RequestHandler = async ({ request, locals, platform }) => {
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

	const existing = await locals.db.select().from(users).where(eq(users.email, email)).get();
	if (existing) {
		if (
			existing.status === 'pending' &&
			displayName &&
			existing.displayName === email.split('@')[0]
		) {
			await locals.db
				.update(users)
				.set({ displayName, updatedAt: new Date().toISOString() })
				.where(eq(users.id, existing.id));
		}
		redirectToJoin(request);
	}

	await findOrCreateUser(locals.db, email, {
		role: 'member',
		allowSignup: true,
		status: 'pending',
		name: displayName ?? undefined
	});

	redirectToJoin(request);
};
