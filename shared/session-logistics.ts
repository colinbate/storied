export const MEETING_FORMATS = {
	in_person: 'In person',
	online: 'Online',
	hybrid: 'Hybrid'
} as const;
export type MeetingFormat = keyof typeof MEETING_FORMATS;
export type SessionLogistics = {
	venueId?: string | null;
	locationName?: string | null;
	meetingFormat?: MeetingFormat | null;
	locationAddress?: string | null;
	joiningUrl?: string | null;
	accessibilityNotes?: string | null;
};

export function mapsUrl(address: string) {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function logisticsText(session: SessionLogistics) {
	return [
		session.meetingFormat ? MEETING_FORMATS[session.meetingFormat] : null,
		session.locationName,
		session.locationAddress,
		session.locationAddress ? `Google Maps: ${mapsUrl(session.locationAddress)}` : null,
		session.joiningUrl ? `Join video call: ${session.joiningUrl}` : null,
		session.accessibilityNotes ? `Accessibility: ${session.accessibilityNotes}` : null
	]
		.filter(Boolean)
		.join('\n');
}
