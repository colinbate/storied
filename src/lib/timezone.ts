export const DEFAULT_TIMEZONE = 'Atlantic/Bermuda';

const dateTimePattern =
	/^(\d{4})-(\d{2})-(\d{2})(?:T|\s)(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/;

export function hasExplicitTimeZone(value: string) {
	return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
}

export function isOffsetlessDateTime(value: string) {
	return dateTimePattern.test(value) && !hasExplicitTimeZone(value);
}

function dateTimeParts(value: string) {
	const match = dateTimePattern.exec(value);
	if (!match) return null;

	const [, year, month, day, hour, minute, second] = match;
	return {
		year: Number(year),
		month: Number(month),
		day: Number(day),
		hour: Number(hour),
		minute: Number(minute),
		second: Number(second ?? '0')
	};
}

function timeZoneOffsetMs(timeZone: string, instantMs: number) {
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

export function zonedDateTimeToDate(value: string, timeZone: string) {
	const parts = dateTimeParts(value);
	if (!parts) return null;

	const localAsUtc = Date.UTC(
		parts.year,
		parts.month - 1,
		parts.day,
		parts.hour,
		parts.minute,
		parts.second
	);
	let instantMs = localAsUtc - timeZoneOffsetMs(timeZone, localAsUtc);
	instantMs = localAsUtc - timeZoneOffsetMs(timeZone, instantMs);

	const date = new Date(instantMs);
	return Number.isFinite(date.valueOf()) ? date : null;
}
