<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import XIcon from '@lucide/svelte/icons/x';

	let {
		src,
		alt,
		class: className = ''
	}: {
		src: string;
		alt: string;
		class?: string;
	} = $props();

	let open = $state(false);
</script>

<Dialog.Root bind:open>
	<button
		type="button"
		class="block max-w-full cursor-zoom-in rounded-lg text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
		onclick={() => (open = true)}
		aria-label="Open attached image"
	>
		<img
			{src}
			{alt}
			class="max-h-128 max-w-full rounded-lg border object-contain {className}"
			loading="lazy"
		/>
	</button>

	<Dialog.Content
		class="w-auto max-w-[calc(100vw-2rem)] bg-transparent p-0 text-white shadow-none ring-0 sm:max-w-[calc(100vw-2rem)]"
		overlayClass="bg-black/80 supports-backdrop-filter:backdrop-blur-sm"
		showCloseButton={false}
	>
		<Dialog.Title class="sr-only">Attached image</Dialog.Title>
		<Dialog.Description class="sr-only">Full-size view of the attached image.</Dialog.Description>
		<img
			{src}
			{alt}
			class="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] rounded-lg object-contain shadow-2xl"
		/>
		<Dialog.Close>
			{#snippet child({ props })}
				<Button
					variant="secondary"
					size="icon"
					class="absolute top-2 right-2 rounded-full bg-black/70 text-white hover:bg-black/90"
					aria-label="Close image"
					{...props}
				>
					<XIcon class="h-5 w-5" />
				</Button>
			{/snippet}
		</Dialog.Close>
	</Dialog.Content>
</Dialog.Root>
