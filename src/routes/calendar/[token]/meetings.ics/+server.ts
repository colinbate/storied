import type { RequestHandler } from './$types';
import { subscribedMeetingCalendar } from '$lib/server/session-calendar';

export const GET: RequestHandler = ({ params, locals }) =>
	subscribedMeetingCalendar(locals.db, params.token);
