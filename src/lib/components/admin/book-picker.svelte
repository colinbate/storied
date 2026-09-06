<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import { Button } from '$lib/components/ui/button';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import LinkIcon from '@lucide/svelte/icons/link';
	import type { ClassValue } from 'svelte/elements';

	type BookItem = {
		id: string;
		title: string;
		authorText?: string | null;
	};

	type Props = {
		books: BookItem[];
		selectedId?: string | undefined | null;
		selectedUrl?: string | null;
		name?: string;
		urlName?: string;
		allowUrl?: boolean;
		class?: ClassValue;
		placeholder?: string;
		searchPlaceholder?: string;
	};

	let {
		books,
		selectedId = $bindable(),
		selectedUrl = $bindable(null),
		name,
		urlName,
		allowUrl = false,
		class: className,
		placeholder = 'Select book...',
		searchPlaceholder
	}: Props = $props();
	let open = $state(false);
	let query = $state('');

	const selected = $derived(books.find((b) => b.id === selectedId));
	const urlCandidate = $derived(
		allowUrl && /^https?:\/\/\S+$/i.test(query.trim()) ? query.trim() : null
	);
	const effectiveSearchPlaceholder = $derived(
		searchPlaceholder ??
			(allowUrl ? 'Search books or authors, or enter a URL...' : 'Search books or authors...')
	);
</script>

{#if name}
	<input type="hidden" {name} value={selectedId ?? ''} />
{/if}
{#if urlName}
	<input type="hidden" name={urlName} value={selectedUrl ?? ''} />
{/if}

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				class={['h-14 w-full justify-between px-3 py-2 text-left', className]}
			>
				<span class="flex min-w-0 items-center gap-3 text-left">
					{#if selectedUrl}
						<LinkIcon class="h-4 w-4 text-muted-foreground" />
					{:else}
						<BookOpenIcon class="h-4 w-4 text-muted-foreground" />
					{/if}
					<span class={['min-w-0 flex-1', !selectedId && !selectedUrl && 'text-muted-foreground']}>
						{#if selected}
							<span class="block truncate font-medium">{selected.title}</span>
							{#if selected.authorText}
								<span class="block truncate text-xs text-muted-foreground"
									>{selected.authorText}</span
								>
							{/if}
						{:else if selectedUrl}
							<span class="block truncate font-medium">Book from URL</span>
							<span class="block truncate text-xs text-muted-foreground">{selectedUrl}</span>
						{:else}
							<span class="block">{placeholder}</span>
						{/if}
					</span>
				</span>
				<ChevronsUpDown class="ml-2 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-[min(36rem,calc(100vw-2rem))] p-0">
		<Command.Root>
			<Command.Input
				autofocus
				placeholder={effectiveSearchPlaceholder}
				class="h-10"
				bind:value={query}
			/>
			<Command.Empty>No books found.</Command.Empty>
			{#if urlCandidate}
				<Command.Group heading="URL">
					<Command.Item
						value={urlCandidate}
						onSelect={() => {
							selectedId = undefined;
							selectedUrl = urlCandidate;
							query = '';
							open = false;
						}}
						class="px-3 py-2"
					>
						<LinkIcon class="h-4 w-4 text-muted-foreground" />
						<span class="min-w-0 flex-1">
							<span class="block font-medium">Use this book URL</span>
							<span class="block truncate text-xs text-muted-foreground">{urlCandidate}</span>
						</span>
					</Command.Item>
				</Command.Group>
			{/if}
			<Command.Group>
				<div style="max-height: 320px; overflow-y: auto;">
					{#each books as b (b.id)}
						<Command.Item
							value={`${b.title} ${b.authorText ?? ''}`}
							onSelect={() => {
								selectedId = b.id;
								selectedUrl = null;
								query = '';
								open = false;
							}}
							class="items-start px-3 py-2"
						>
							<span
								class="mt-0.5 flex h-8 w-6 shrink-0 items-center justify-center rounded bg-muted"
							>
								<BookOpenIcon class="h-4 w-4 text-muted-foreground" />
							</span>
							<div class="min-w-0 flex-1">
								<span class="block truncate font-medium">{b.title}</span>
								{#if b.authorText}
									<span class="block truncate text-xs text-muted-foreground">{b.authorText}</span>
								{/if}
							</div>
						</Command.Item>
					{/each}
				</div>
			</Command.Group>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
