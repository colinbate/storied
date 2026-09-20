/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { build, version } from '$service-worker';

const worker = globalThis as unknown as ServiceWorkerGlobalScope;
const cachePrefix = 'storied-static-';
const cacheName = `${cachePrefix}${version}`;
const offlinePage = '/offline.html';
const precachedAssets = [offlinePage, '/favicon.svg'];
const appAssets = new Set(build);

worker.addEventListener('install', (event) => {
	event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(precachedAssets)));
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key.startsWith(cachePrefix) && key !== cacheName)
						.map((key) => caches.delete(key))
				)
			)
	);
});

worker.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);
	if (url.origin !== worker.location.origin) return;

	if (appAssets.has(url.pathname) || precachedAssets.includes(url.pathname)) {
		event.respondWith(
			caches.open(cacheName).then(async (cache) => {
				const cachedResponse = await cache.match(url.pathname);
				if (cachedResponse) return cachedResponse;

				const response = await fetch(event.request);
				if (response.ok) await cache.put(url.pathname, response.clone());
				return response;
			})
		);
		return;
	}

	if (event.request.mode === 'navigate') {
		event.respondWith(
			fetch(event.request).catch(async () => {
				const cache = await caches.open(cacheName);
				const response = await cache.match(offlinePage);
				return response ?? Response.error();
			})
		);
	}
});
