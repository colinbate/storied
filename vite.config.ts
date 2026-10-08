import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		fs: {
			// SvelteKit adds its source directories; also serve the shared browser modules.
			allow: [fileURLToPath(new URL('./shared', import.meta.url))]
		}
	}
});
