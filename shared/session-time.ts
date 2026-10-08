import {
	DEFAULT_SESSION_TIMEZONE,
	formatSessionDateInTimeZone,
	sessionStartInstant,
	validSessionTimeZone
} from './session-reminder-timezone';

type MeetingTime = { startsAt: string | null; timezone?: string | null };

function memberTimeZone(value?: string | null) {
	if (!value) return null;
	try {
		return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
	} catch {
		return null;
	}
}

/** Resolve the event's wall time once, then format that instant in both timezones. */
export function formatSessionTimes(session: MeetingTime, viewerTimeZone?: string | null) {
	const eventTimeZone = validSessionTimeZone(session.timezone ?? DEFAULT_SESSION_TIMEZONE);
	const start = session.startsAt ? sessionStartInstant(session.startsAt, eventTimeZone) : null;
	if (!start) return { event: 'Date to be confirmed', local: null, datetime: null };

	const datetime = start.toISOString();
	const event = formatSessionDateInTimeZone(datetime, eventTimeZone);
	const localTimeZone = memberTimeZone(viewerTimeZone);
	const wallTime = (timeZone: string) =>
		new Intl.DateTimeFormat('en-US', {
			dateStyle: 'full',
			timeStyle: 'short',
			timeZone
		}).format(start);
	const local =
		localTimeZone && wallTime(localTimeZone) !== wallTime(eventTimeZone)
			? formatSessionDateInTimeZone(datetime, localTimeZone)
			: null;
	return { event, local, datetime };
}
