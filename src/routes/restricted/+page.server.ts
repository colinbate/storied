import { fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { notificationPreferences, users } from '$lib/server/db/schema';
import {
	awardAchievement,
	hasAchievement,
	RESTRICTED_CATALOG_ACHIEVEMENT
} from '$lib/server/achievements';
import { publishWorkerMessage } from '$lib/server/worker-queue';

const CLAIM_COOKIE = 'storied-restricted-catalog';
const CLAIM_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const CLAIM_PAYLOAD = RESTRICTED_CATALOG_ACHIEVEMENT;

function normalizeCode(value: string) {
	return value.toLowerCase().replace(/\W/g, '');
}

function bytesToBase64Url(bytes: Uint8Array) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signClaim(secret: string) {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(CLAIM_PAYLOAD));
	return `${CLAIM_PAYLOAD}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function isValidClaim(value: string | undefined, secret: string | undefined) {
	if (!value || !secret) return false;
	return value === (await signClaim(secret));
}

async function notifyAdmins(
	platform: App.Platform | undefined,
	locals: App.Locals,
	memberName: string | null,
	url: URL
) {
	const recipients = await locals.db
		.select({
			id: users.id,
			userKey: notificationPreferences.pushoverUserKey,
			device: notificationPreferences.pushoverDevice
		})
		.from(users)
		.innerJoin(notificationPreferences, eq(notificationPreferences.userId, users.id))
		.where(
			and(
				eq(users.role, 'admin'),
				eq(users.status, 'active'),
				eq(notificationPreferences.pushoverEnabled, true)
			)
		);

	await Promise.all(
		recipients
			.filter((recipient) => recipient.userKey)
			.map((recipient) =>
				publishWorkerMessage(platform?.env.STORIED_WORKER, 'notifications.pushover', {
					userId: recipient.id,
					userKey: recipient.userKey!,
					device: recipient.device,
					title: 'Restricted catalog accessed',
					message: memberName
						? `${memberName} reached Archive access level one.`
						: 'An unidentified visitor reached Archive access level one.',
					url: url.toString(),
					urlTitle: 'Open restricted catalog',
					eventType: 'achievement'
				})
			)
	);
}

export const load: PageServerLoad = async ({ locals, cookies, platform }) => {
	const secret = platform?.env.RESTRICTED_CATALOG_CODE;
	const cookieClaim = await isValidClaim(cookies.get(CLAIM_COOKIE), secret);
	let awarded = false;

	if (locals.user && cookieClaim) {
		awarded = await awardAchievement(locals.db, locals.user.id, RESTRICTED_CATALOG_ACHIEVEMENT, {
			accessLevel: 1
		});
		cookies.delete(CLAIM_COOKIE, { path: '/restricted' });
	}

	const memberHasAccess = locals.user
		? await hasAchievement(locals.db, locals.user.id, RESTRICTED_CATALOG_ACHIEVEMENT)
		: false;

	return {
		revealed: cookieClaim || memberHasAccess,
		signedIn: Boolean(locals.user),
		memberName: locals.user?.displayName ?? null,
		newlyClaimed: awarded,
		configured: Boolean(secret)
	};
};

export const actions: Actions = {
	default: async ({ request, locals, cookies, platform, url }) => {
		const secret = platform?.env.RESTRICTED_CATALOG_CODE;
		if (!secret) {
			console.error('RESTRICTED_CATALOG_CODE is not configured');
			return fail(503, { error: 'The catalog terminal is presently unavailable.' });
		}

		const data = await request.formData();
		const submitted = data.get('code')?.toString() ?? '';
		if (!submitted.trim() || normalizeCode(submitted) !== normalizeCode(secret)) {
			return fail(400, { error: 'No corresponding catalog identity was found.' });
		}

		if (locals.user) {
			const awarded = await awardAchievement(
				locals.db,
				locals.user.id,
				RESTRICTED_CATALOG_ACHIEVEMENT,
				{ accessLevel: 1 }
			);
			if (awarded) await notifyAdmins(platform, locals, locals.user.displayName, url);
		} else {
			cookies.set(CLAIM_COOKIE, await signClaim(secret), {
				path: '/restricted',
				httpOnly: true,
				secure: true,
				sameSite: 'lax',
				maxAge: CLAIM_MAX_AGE_SECONDS
			});
			await notifyAdmins(platform, locals, null, url);
		}

		redirect(303, '/restricted');
	}
};
