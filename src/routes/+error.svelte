<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? 'Something went wrong');

	const subtitle = $derived(
		status === 404
			? 'Lost in the Triangle'
			: status === 403
				? 'Access Denied'
				: 'Something Went Wrong'
	);

	const description = $derived(
		status === 404
			? "The page you're looking for seems to have vanished into the Bermuda Triangle. It may never have existed, or it drifted away."
			: status === 403
				? "You don't have permission to access this area. If you believe this is a mistake, please contact an administrator."
				: "An unexpected error occurred on our end. Our team has been notified, and we're working to resolve it."
	);
</script>

<svelte:head>
	<title>{status} — Bermuda Triangle Society</title>
</svelte:head>

{#snippet errorIcon()}
	{#if status === 404}
		<!-- Compass / lost icon -->
		<svg
			class="h-24 w-24 text-purple-400 dark:text-purple-500"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="1.2"
			stroke="currentColor"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 0v2m0 16v-2m10-8h-2M4 12H2m15.07-5.07-1.41 1.41M8.34 15.66l-1.41 1.41m0-10.14 1.41 1.41m7.32 7.32 1.41 1.41"
			/>
			<path stroke-linecap="round" stroke-linejoin="round" d="m14.5 9.5-5 2 2 5 5-2z" />
		</svg>
	{:else if status === 403}
		<!-- Lock / forbidden icon -->
		<svg
			class="h-24 w-24 text-purple-400 dark:text-purple-500"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="1.2"
			stroke="currentColor"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
			/>
		</svg>
	{:else}
		<!-- Warning triangle icon -->
		<svg
			class="h-24 w-24 text-purple-400 dark:text-purple-500"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="1.2"
			stroke="currentColor"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
			/>
		</svg>
	{/if}
{/snippet}

<div class="flex min-h-screen flex-col items-center justify-center px-4">
	<div class="text-center">
		<div class="mb-6 flex justify-center">
			{@render errorIcon()}
		</div>

		<p class="text-7xl font-extrabold tracking-tight text-purple-600 dark:text-purple-400">
			{status}
		</p>

		<h1 class="mt-4 text-3xl font-bold text-gray-900 dark:text-gray-100">
			{subtitle}
		</h1>

		<p class="mx-auto mt-4 max-w-md text-base text-gray-500 dark:text-gray-400">
			{description}
		</p>

		{#if message && message !== subtitle}
			<p class="mx-auto mt-2 max-w-md text-sm text-gray-400 italic dark:text-gray-500">
				{message}
			</p>
		{/if}

		<div class="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
			<a
				href={resolve('/')}
				class="inline-flex items-center gap-2 rounded-md bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:bg-purple-500 dark:hover:bg-purple-600"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
					/>
				</svg>
				Go Home
			</a>
			<button
				onclick={() => history.back()}
				class="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"
					/>
				</svg>
				Go Back
			</button>
		</div>
	</div>

	<!-- Decorative triangles in background -->
	<div
		class="pointer-events-none absolute inset-0 overflow-hidden opacity-5 dark:opacity-[0.03]"
		aria-hidden="true"
	>
		<svg
			class="absolute top-1/2 left-1/2 h-150 w-150 -translate-x-1/2 -translate-y-1/2"
			viewBox="0 0 100 100"
			fill="none"
			stroke="currentColor"
			stroke-width="0.5"
		>
			<polygon points="50,5 95,90 5,90" class="text-purple-900 dark:text-purple-300" />
			<polygon points="50,15 85,82 15,82" class="text-purple-900 dark:text-purple-300" />
			<polygon points="50,25 75,74 25,74" class="text-purple-900 dark:text-purple-300" />
		</svg>
	</div>
</div>
