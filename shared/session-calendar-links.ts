import { logisticsText, type SessionLogistics } from './session-logistics';
import { sessionStartDate, type SessionTiming } from './session-lifecycle';

type CalendarSession = SessionTiming &
	SessionLogistics & {
		id: string;
		slug: string;
		title?: string;
		status?: string;
		theme?: string | null;
		themeTitle?: string | null;
		locationName?: string | null;
	};

export type SessionCalendarLink = {
	kind: 'google' | 'yahoo' | 'outlook-mobile' | 'outlook-web' | 'ical';
	label: string;
	href: string;
};

function utcDateTime(date: Date) {
	return date.toISOString().replaceAll('-', '').replaceAll(':', '').replace('.000', '');
}

export function createSessionCalendarLinks(
	session: CalendarSession,
	urls: {
		detailsUrl: string;
		icsUrl?: string | null;
		attendanceStatus?: string | null;
		includePrivate?: boolean;
	}
): SessionCalendarLink[] {
	const start = sessionStartDate(session);
	if (!start || !session.durationMinutes) return [];
	const end = new Date(start.getTime() + session.durationMinutes * 60_000);
	if (
		session.status === 'cancelled' ||
		['cancelled', 'declined'].includes(urls.attendanceStatus ?? '')
	)
		return urls.icsUrl ? [{ kind: 'ical', label: 'iCal', href: urls.icsUrl }] : [];
	const title = `${session.title ?? 'Meeting'}${urls.attendanceStatus === 'waitlisted' ? ' (Waitlisted)' : urls.attendanceStatus === 'maybe' ? ' (Tentative)' : ''}`;
	const theme = session.themeTitle ?? session.theme;
	const description = [
		calendarRsvpLabel(urls.attendanceStatus),
		theme ? `Theme: ${theme}` : null,
		urls.includePrivate ? logisticsText(session) : null,
		`View session details: ${urls.detailsUrl}`
	]
		.filter(Boolean)
		.join('\n');

	const location = [session.locationName, urls.includePrivate ? session.locationAddress : null]
		.filter(Boolean)
		.join(', ');
	const google = new URL('https://calendar.google.com/calendar/render');
	google.search = new URLSearchParams({
		action: 'TEMPLATE',
		text: title,
		dates: `${utcDateTime(start)}/${utcDateTime(end)}`,
		details: description,
		location: location
	}).toString();

	const yahoo = new URL('https://calendar.yahoo.com/');
	yahoo.search = new URLSearchParams({
		v: '60',
		view: 'd',
		type: '20',
		title,
		st: utcDateTime(start),
		dur:
			`${Math.floor(session.durationMinutes / 60)}`.padStart(2, '0') +
			`${session.durationMinutes % 60}`.padStart(2, '0'),
		desc: description,
		in_loc: location
	}).toString();

	const outlookFields = {
		subject: title,
		startdt: start.toISOString(),
		enddt: end.toISOString(),
		body: description,
		location: location
	};
	const outlookWeb = new URL('https://outlook.live.com/calendar/0/action/compose');
	outlookWeb.search = new URLSearchParams({ rru: 'addevent', ...outlookFields }).toString();
	const outlookMobile = `ms-outlook://events/new?${new URLSearchParams({
		title,
		start: start.toISOString(),
		end: end.toISOString(),
		description,
		location: location
	})}`;

	const links: SessionCalendarLink[] = [
		{ kind: 'google', label: 'Google', href: google.toString() },
		{ kind: 'yahoo', label: 'Yahoo', href: yahoo.toString() },
		{ kind: 'outlook-mobile', label: 'Outlook Mobile', href: outlookMobile },
		{ kind: 'outlook-web', label: 'Outlook Web', href: outlookWeb.toString() }
	];
	if (urls.icsUrl) links.push({ kind: 'ical', label: 'iCal', href: urls.icsUrl });
	return links;
}

export function calendarRsvpLabel(status?: string | null) {
	if (status === 'waitlisted') return 'RSVP: Waitlisted. Your place is not confirmed.';
	if (status === 'maybe') return 'RSVP: Tentative.';
	if (status === 'cancelled' || status === 'declined') return 'RSVP: Cancelled.';
	return status === 'attending' ? 'RSVP: Confirmed.' : '';
}
