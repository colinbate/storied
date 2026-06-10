import { DEFAULT_TIMEZONE } from '$lib/timezone';

const fallbackTimezones = [
	'UTC',
	DEFAULT_TIMEZONE,
	'America/Chicago',
	'America/Denver',
	'America/Halifax',
	'America/Los_Angeles',
	'America/New_York',
	'Europe/London',
	'Europe/Berlin'
];

export function detectedTimeZone() {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
	} catch {
		return '';
	}
}

export function supportedTimeZones(...preferredTimezones: (string | null | undefined)[]) {
	let zones: string[] = [];
	try {
		if (typeof Intl.supportedValuesOf === 'function') {
			zones = Intl.supportedValuesOf('timeZone') as string[];
		}
	} catch {
		zones = [];
	}

	const preferred = preferredTimezones.filter((tz): tz is string => !!tz);
	if (zones.length === 0) {
		return [...new Set([...preferred, ...fallbackTimezones])];
	}

	const set = new Set([...preferred, ...zones]);
	return Array.from(set);
}
