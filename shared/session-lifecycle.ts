import { DEFAULT_SESSION_TIMEZONE, sessionStartInstant } from './session-reminder-timezone';

export const SESSION_STATUSES = ['draft', 'scheduled', 'current', 'past', 'cancelled'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
	draft: 'Draft',
	scheduled: 'Upcoming',
	current: 'Current',
	past: 'Past',
	cancelled: 'Cancelled'
};

export type SessionTiming = {
	startsAt: string | null;
	timezone?: string | null;
	durationMinutes?: number | null;
};

export function isSessionStatus(value: unknown): value is SessionStatus {
	return SESSION_STATUSES.some((status) => status === value);
}

export function sessionStartDate(session: SessionTiming) {
	return session.startsAt
		? sessionStartInstant(session.startsAt, session.timezone ?? DEFAULT_SESSION_TIMEZONE)
		: null;
}

export function isFutureSession(session: SessionTiming, now = new Date()) {
	const start = sessionStartDate(session);
	return start !== null && start > now;
}

export function hasSessionEnded(session: SessionTiming, now = new Date()) {
	const start = sessionStartDate(session);
	return (
		start !== null && start.getTime() + (session.durationMinutes ?? 0) * 60_000 <= now.getTime()
	);
}

type SessionPreparationCandidate = SessionTiming & {
	status: string;
	liveStartedAt?: string | null;
	liveEndedAt?: string | null;
};

/** Live meetings remain active until the facilitator ends them, even if they run over. */
export function isCompletedSession(session: SessionPreparationCandidate, now = new Date()) {
	return (
		!!session.liveEndedAt ||
		session.status === 'past' ||
		(!session.liveStartedAt && hasSessionEnded(session, now))
	);
}

/** Select from visible sessions; drafts and cancelled meetings never become preparation targets. */
export function selectNextSession<T extends SessionPreparationCandidate>(
	candidates: readonly T[],
	now = new Date()
): T | null {
	const eligible = candidates.filter(
		(session) =>
			(session.status === 'current' || session.status === 'scheduled') &&
			!isCompletedSession(session, now) &&
			(!!session.liveStartedAt || sessionStartDate(session) !== null)
	);
	const priority = (session: T) =>
		session.liveStartedAt ? 0 : session.status === 'current' ? 1 : 2;
	eligible.sort(
		(a, b) =>
			priority(a) - priority(b) ||
			(sessionStartDate(a)?.getTime() ?? Infinity) - (sessionStartDate(b)?.getTime() ?? Infinity)
	);
	return eligible[0] ?? null;
}

export function canAcceptSessionRsvps(
	session: SessionTiming & { status: string; rsvpEnabled?: boolean },
	now = new Date()
) {
	return (
		(session.status === 'current' || session.status === 'scheduled') &&
		session.rsvpEnabled !== false &&
		isFutureSession(session, now)
	);
}

export function canDeclineSessionRsvp(session: SessionTiming & { status: string }) {
	return canAcceptSessionRsvps({ ...session, rsvpEnabled: true });
}

export function sessionPublicationError(
	session: SessionTiming & { themeId: string | null; status: SessionStatus }
) {
	if (session.startsAt && !sessionStartDate(session)) return 'Enter a valid session date and time.';
	if (session.status === 'draft' || session.status === 'cancelled') return null;
	if (!session.startsAt) return 'Choose a date and time before publishing the session.';
	if ((session.status === 'current' || session.status === 'past') && !session.themeId)
		return `Choose a theme before making the session ${session.status}.`;
	return null;
}
