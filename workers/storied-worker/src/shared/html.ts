import { PRIMARY_ORIGIN } from '$shared/brand';

export async function fetchHtml(url: string): Promise<Response | null> {
	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent': `Mozilla/5.0 (compatible; StoriedBot/1.0; +${PRIMARY_ORIGIN})`,
				Accept: 'text/html'
			},
			redirect: 'follow'
		});
		if (!response.ok) return null;
		return response;
	} catch (err) {
		console.error('[FETCH ERROR]', err);
		return null;
	}
}

export function htmlDecode(input: string): string {
	return input
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

/** Extract the data-react-props JSON for a named React component on a page. */
export function extractReactProps(
	html: string,
	componentName: string
): Record<string, unknown> | null {
	const escaped = componentName.replace(/\./g, '\\.');
	const regex = new RegExp(`data-react-class="${escaped}"\\s+data-react-props="([^"]+)"`, 'i');
	const match = html.match(regex);
	if (!match) return null;
	const decoded = htmlDecode(match[1]);
	try {
		return JSON.parse(decoded);
	} catch (err) {
		console.error('[EXTRACT] Failed to parse react props for', componentName, err);
		return null;
	}
}
