import { ORGANIZATION_NAME } from './brand';
import { sessionStartDate, type SessionTiming } from './session-lifecycle';

type CalendarSession = SessionTiming & {
	id: string;
	slug: string;
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
	urls: { detailsUrl: string; icsUrl?: string | null }
): SessionCalendarLink[] {
	const start = sessionStartDate(session);
	if (!start || !session.durationMinutes) return [];
	const end = new Date(start.getTime() + session.durationMinutes * 60_000);
	const title = `${ORGANIZATION_NAME} Meeting`;
	const theme = session.themeTitle ?? session.theme;
	const description = [theme ? `Theme: ${theme}` : null, `View session details: ${urls.detailsUrl}`]
		.filter(Boolean)
		.join('\n');

	const google = new URL('https://calendar.google.com/calendar/render');
	google.search = new URLSearchParams({
		action: 'TEMPLATE',
		text: title,
		dates: `${utcDateTime(start)}/${utcDateTime(end)}`,
		details: description,
		location: session.locationName ?? ''
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
		in_loc: session.locationName ?? ''
	}).toString();

	const outlookFields = {
		subject: title,
		startdt: start.toISOString(),
		enddt: end.toISOString(),
		body: description,
		location: session.locationName ?? ''
	};
	const outlookWeb = new URL('https://outlook.live.com/calendar/0/action/compose');
	outlookWeb.search = new URLSearchParams({ rru: 'addevent', ...outlookFields }).toString();
	const outlookMobile = `ms-outlook://events/new?${new URLSearchParams({
		title,
		start: start.toISOString(),
		end: end.toISOString(),
		description,
		location: session.locationName ?? ''
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
