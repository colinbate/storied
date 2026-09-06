/**
 * Attendee messaging vocabulary shared by the admin UI and the server. Keep this file
 * dependency-light so both tsconfigs can include it.
 */
import { formatSessionDateInTimeZone } from './session-reminder-timezone';

export const SESSION_MESSAGE_AUDIENCES = [
	'attending',
	'waitlisted',
	'maybe',
	'past_attendees'
] as const;
export type SessionMessageAudience = (typeof SESSION_MESSAGE_AUDIENCES)[number];

export const SESSION_MESSAGE_AUDIENCE_LABELS: Record<
	SessionMessageAudience,
	{ label: string; description: string; reason: string }
> = {
	attending: {
		label: 'Confirmed attendees',
		description: 'Everyone with a confirmed place.',
		reason: 'you have a confirmed place at this session'
	},
	waitlisted: {
		label: 'Waitlist',
		description: 'People waiting for a place to open.',
		reason: 'you are on the waitlist for this session'
	},
	maybe: {
		label: 'Maybe',
		description: 'People who answered maybe.',
		reason: 'you replied maybe to this session'
	},
	past_attendees: {
		label: 'Past attendees without a reply',
		description: 'People who came to an earlier session and have not responded to this one.',
		reason: 'you attended an earlier session and have not replied to this one'
	}
};

export function isSessionMessageAudience(value: unknown): value is SessionMessageAudience {
	return SESSION_MESSAGE_AUDIENCES.some((audience) => audience === value);
}

export function parseSessionMessageAudiences(value: string | null | undefined) {
	return (value ?? '')
		.split(',')
		.map((part) => part.trim())
		.filter(isSessionMessageAudience);
}

type SessionSummary = {
	title: string;
	startsAt: string | null;
	timezone?: string | null;
	locationName?: string | null;
};

export function formatSessionWhen(session: Pick<SessionSummary, 'startsAt' | 'timezone'>) {
	return session.startsAt
		? formatSessionDateInTimeZone(session.startsAt, session.timezone ?? 'Atlantic/Bermuda')
		: 'Date to be confirmed';
}

export type SessionDetailChange = {
	field: 'when' | 'location';
	label: string;
	from: string;
	to: string;
};

/** Changes to the details attendees plan around: the start time and the venue. */
export function detectSessionDetailChanges(
	before: SessionSummary,
	after: SessionSummary
): SessionDetailChange[] {
	const changes: SessionDetailChange[] = [];
	const previousWhen = formatSessionWhen(before);
	const nextWhen = formatSessionWhen(after);
	if (previousWhen !== nextWhen) {
		changes.push({ field: 'when', label: 'When', from: previousWhen, to: nextWhen });
	}
	const previousLocation = before.locationName?.trim() || 'No location set';
	const nextLocation = after.locationName?.trim() || 'No location set';
	if (previousLocation !== nextLocation) {
		changes.push({
			field: 'location',
			label: 'Where',
			from: previousLocation,
			to: nextLocation
		});
	}
	return changes;
}

export type SessionMessageDraft = { subject: string; body: string };

export function buildSessionUpdateMessage(
	session: SessionSummary,
	changes: SessionDetailChange[]
): SessionMessageDraft {
	const lines = changes.map((change) => `- **${change.label}:** ${change.to} (was ${change.from})`);
	if (lines.length === 0) {
		lines.push(`- **When:** ${formatSessionWhen(session)}`);
		if (session.locationName?.trim()) lines.push(`- **Where:** ${session.locationName.trim()}`);
	}
	return {
		subject: `Update: ${session.title}`,
		body: [
			`The details for **${session.title}** have changed.`,
			``,
			...lines,
			``,
			`If you can no longer attend, please update your RSVP so we can offer your place to someone else.`
		].join('\n')
	};
}

export function buildSessionCancellationMessage(session: SessionSummary): SessionMessageDraft {
	return {
		subject: `Cancelled: ${session.title}`,
		body: [
			`**${session.title}**, planned for ${formatSessionWhen(session)}, has been cancelled.`,
			``,
			`We are sorry for the change of plans. Keep an eye out for details of the next session.`
		].join('\n')
	};
}
