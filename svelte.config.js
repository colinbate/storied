import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		csrf: {
			trustedOrigins: [
				'https://bermudatrianglesociety.com',
				'https://archive.bermudatrianglesociety.com',
				'https://discuss.bermudatrianglesociety.com'
			]
		},
		alias: {
			$shared: 'shared'
		},
		version: {
			pollInterval: 900_000
		}
	}
};

export default config;
