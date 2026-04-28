import type { PendingSignupNotificationPayload } from '$shared/worker-messages';
import type { HandlerContext } from '../dispatch';
import { generateId } from '../shared/ids';
import { renderPendingSignupAlertEmail, sendEmail } from './email';
import { queuePushoverForRecipients } from './pushover';

export async function handlePendingSignupNotification(
	payload: PendingSignupNotificationPayload,
	{ env }: HandlerContext
): Promise<void> {
	const { userId, baseUrl } = payload;
	const member = await env.DB.prepare(
		`SELECT id, email, display_name FROM users WHERE id = ? AND status = 'pending'`
	)
		.bind(userId)
		.first<{ id: string; email: string; display_name: string }>();
	if (!member) return;

	const adminUrl = `${baseUrl}/admin/members`;
	const adminsResult = await env.DB.prepare(
		`SELECT u.id AS user_id, u.email AS email, np.pushover_enabled AS pushover_enabled, np.pushover_user_key AS pushover_user_key, np.pushover_device AS pushover_device
		 FROM users u
		 LEFT JOIN notification_preferences np ON np.user_id = u.id
		 WHERE u.role = 'admin'
		   AND u.status = 'active'`
	).all<{
		user_id: string;
		email: string;
		pushover_enabled: number | null;
		pushover_user_key: string | null;
		pushover_device: string | null;
	}>();

	const admins = adminsResult.results ?? [];
	if (admins.length === 0) return;

	const template = renderPendingSignupAlertEmail({
		memberEmail: member.email,
		memberDisplayName: member.display_name,
		adminUrl
	});

	await queuePushoverForRecipients(
		env,
		admins
			.filter((admin) => admin.pushover_enabled === 1 && admin.pushover_user_key)
			.map((admin) => ({
				user_id: admin.user_id,
				pushover_user_key: admin.pushover_user_key as string,
				pushover_device: admin.pushover_device
			})),
		{
			title: 'New signup pending approval',
			message: `${member.display_name} <${member.email}> is waiting for approval.`,
			url: adminUrl,
			urlTitle: 'Review members',
			priority: 1,
			eventType: 'pending_signup'
		}
	);

	for (const admin of admins) {
		const now = new Date().toISOString();
		await env.DB.prepare(
			`INSERT INTO notification_events (id, user_id, event_type, payload_json, status, created_at, updated_at)
			 VALUES (?, ?, 'pending_signup', ?, 'pending', ?, ?)`
		)
			.bind(
				generateId(),
				admin.user_id,
				JSON.stringify({ memberUserId: member.id, channel: 'email' }),
				now,
				now
			)
			.run();

		await sendEmail(env, {
			to: admin.email,
			subject: template.subject,
			textBody: template.textBody,
			htmlBody: template.htmlBody
		});
	}
}
