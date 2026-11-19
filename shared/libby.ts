type AccessOption = {
	providerName: string;
	providerType: string;
	url?: string | null;
};

export function isLibbyAccessOption(option: AccessOption) {
	if (option.providerType !== 'library') return false;
	if (/\blibby\b/i.test(option.providerName)) return true;
	if (!option.url) return false;
	try {
		const url = new URL(option.url);
		return (
			['http:', 'https:'].includes(url.protocol) &&
			(url.hostname === 'libbyapp.com' || url.hostname.endsWith('.libbyapp.com'))
		);
	} catch {
		return false;
	}
}
