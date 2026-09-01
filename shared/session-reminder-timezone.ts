export const DEFAULT_SESSION_TIMEZONE = 'Atlantic/Bermuda';

interface LocalDateParts {
	year: number;
	month: number;
	day: number;
}

const offsetlessDateTimePattern =
	/^(\d{4})-(\d{2})-(\d{2})(?:T|\s)(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/;

export function validSessionTimeZone(value: string): string {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
		return value;
	} catch {
		return DEFAULT_SESSION_TIMEZONE;
	}
}

function localDateParts(date: Date, timeZone: string): LocalDateParts {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(date);
	const values = Object.fromEntries(
		parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
	);
	return {
		year: Number(values.year),
		month: Number(values.month),
		day: Number(values.day)
	};
}

function dateKey(parts: LocalDateParts): string {
	return `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`;
}

function tomorrowDateKey(now: Date, timeZone: string): string {
	const localToday = localDateParts(now, timeZone);
	const tomorrow = new Date(Date.UTC(localToday.year, localToday.month - 1, localToday.day + 1));
	return dateKey({
		year: tomorrow.getUTCFullYear(),
		month: tomorrow.getUTCMonth() + 1,
		day: tomorrow.getUTCDate()
	});
}

function offsetAt(timeZone: string, instantMs: number): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(new Date(instantMs));
	const values = Object.fromEntries(
		parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)])
	);
	return (
		Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second) -
		instantMs
	);
}

export function sessionStartInstant(startsAt: string, rawTimeZone: string): Date | null {
	const timeZone = validSessionTimeZone(rawTimeZone);
	const offsetless = offsetlessDateTimePattern.exec(startsAt);
	if (!offsetless) {
		const parsed = new Date(startsAt);
		return Number.isFinite(parsed.valueOf()) ? parsed : null;
	}

	const [, year, month, day, hour, minute, second] = offsetless;
	const localAsUtc = Date.UTC(
		Number(year),
		Number(month) - 1,
		Number(day),
		Number(hour),
		Number(minute),
		Number(second ?? '0')
	);
	let instantMs = localAsUtc - offsetAt(timeZone, localAsUtc);
	instantMs = localAsUtc - offsetAt(timeZone, instantMs);
	const result = new Date(instantMs);
	return Number.isFinite(result.valueOf()) ? result : null;
}

export function sessionOccursOnNextLocalDay(
	startsAt: string,
	rawTimeZone: string,
	now: Date
): boolean {
	const timeZone = validSessionTimeZone(rawTimeZone);
	const offsetless = offsetlessDateTimePattern.exec(startsAt);
	const sessionDate = offsetless
		? `${offsetless[1]}-${offsetless[2]}-${offsetless[3]}`
		: (() => {
				const instant = sessionStartInstant(startsAt, timeZone);
				return instant ? dateKey(localDateParts(instant, timeZone)) : null;
			})();
	return sessionDate !== null && sessionDate === tomorrowDateKey(now, timeZone);
}

export function formatSessionDateInTimeZone(startsAt: string, rawTimeZone: string): string {
	const timeZone = validSessionTimeZone(rawTimeZone);
	const instant = sessionStartInstant(startsAt, timeZone);
	if (!instant) return 'Date to be confirmed';
	return new Intl.DateTimeFormat('en-US', {
		timeZone,
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZoneName: 'short'
	}).format(instant);
}
