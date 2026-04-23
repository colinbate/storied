export function normalizeEmail(raw: FormDataEntryValue | null): string | null {
	const email = raw?.toString()?.trim()?.toLowerCase();
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
	return email;
}

export function normalizeDisplayName(raw: FormDataEntryValue | null): string | null {
	const name = raw?.toString()?.trim().replace(/\s+/g, ' ');
	if (!name) return null;
	return name.slice(0, 50);
}

export function getDisplayNameFromForm(data: FormData): string | null {
	return normalizeDisplayName(data.get('displayName')) ?? normalizeDisplayName(data.get('name'));
}
