import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

// Run the application's TypeScript with Node's type stripping and SvelteKit aliases.
registerHooks({
	resolve(specifier, context, nextResolve) {
		let target;
		if (specifier.startsWith('$lib/')) target = resolvePath('src/lib', specifier.slice(5));
		else if (specifier.startsWith('$shared/')) target = resolvePath('shared', specifier.slice(8));
		else if (
			specifier.startsWith('.') &&
			context.parentURL?.startsWith('file:') &&
			!context.parentURL.includes('/node_modules/')
		)
			target = fileURLToPath(new URL(specifier, context.parentURL));
		if (target) {
			for (const candidate of [target, `${target}.ts`, `${target}/index.ts`]) {
				if (existsSync(candidate) && /\.(ts|js|mjs)$/.test(candidate))
					return nextResolve(pathToFileURL(candidate).href, context);
			}
		}
		return nextResolve(specifier, context);
	}
});
