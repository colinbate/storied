import { isOffsetlessDateTime, zonedDateTimeToDate } from '$lib/timezone';

type TimeDisplay = 'never' | 'auto' | 'always';

interface FormatDateOptions {
	time?: TimeDisplay;
	timeZone?: string | null;
	empty?: string;
	dateStyle?: Intl.DateTimeFormatOptions['dateStyle'];
	timeStyle?: Intl.DateTimeFormatOptions['timeStyle'];
	weekday?: Intl.DateTimeFormatOptions['weekday'];
}

function hasTime(value: string) {
	return /(?:T|\s)\d{2}:\d{2}/.test(value);
}

function browserTimeZone() {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		return undefined;
	}
}

function validTimeZone(timeZone: string | null | undefined) {
	if (!timeZone) return undefined;
	try {
		new Intl.DateTimeFormat(undefined, { timeZone }).format(new Date());
		return timeZone;
	} catch {
		return undefined;
	}
}

function parseDate(value: string, timeZone?: string) {
	const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
	if (isDateOnly) {
		const [year, month, day] = value.split('-').map(Number);
		return new Date(Date.UTC(year, month - 1, day, 12));
	}
	if (timeZone && isOffsetlessDateTime(value)) {
		return zonedDateTimeToDate(value, timeZone) ?? new Date(value);
	}
	return new Date(value);
}

export function formatDate(
	value: string | Date | null | undefined,
	options: FormatDateOptions = {}
) {
	if (!value) return options.empty ?? 'Date to be announced';

	let source: string | null = null;
	let date: Date;
	const timeZone = validTimeZone(options.timeZone) ?? browserTimeZone();
	if (value instanceof Date) {
		date = value;
	} else {
		source = value.toString();
		date = parseDate(source, timeZone);
	}
	if (Number.isNaN(date.getTime())) return options.empty ?? '';

	const time = options.time ?? 'auto';
	const includeTime = time === 'always' || (time === 'auto' && source !== null && hasTime(source));
	const dateOnly = source !== null && /^\d{4}-\d{2}-\d{2}$/.test(source);

	const formatOptions: Intl.DateTimeFormatOptions = {
		dateStyle: options.dateStyle ?? 'medium',
		...(options.weekday ? { weekday: options.weekday } : {}),
		...(includeTime ? { timeStyle: options.timeStyle ?? 'short' } : {}),
		...(timeZone && !dateOnly ? { timeZone } : {})
	};

	return new Intl.DateTimeFormat(undefined, formatOptions).format(date);
}
