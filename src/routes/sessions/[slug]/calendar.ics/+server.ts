import type { RequestHandler } from './$types';
import { downloadSessionCalendar } from '$lib/server/session-calendar';

export const GET: RequestHandler = ({ params, locals, url }) =>
	downloadSessionCalendar(locals, params.slug, url.searchParams.get('token'));
