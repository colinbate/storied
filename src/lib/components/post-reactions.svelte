<script lang="ts">
	import { enhance } from '$app/forms';
	import { SvelteMap } from 'svelte/reactivity';
	import { page } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import SmilePlusIcon from '@lucide/svelte/icons/smile-plus';
	import { toast } from 'svelte-sonner';
	import * as Popover from '$lib/components/ui/popover';
	import type { EmojiOption } from '$shared/emoji-data';
	import { MAX_REACTION_EMOJIS, type ReactionSummary } from '$shared/reactions';

	let {
		postId = null,
		reactions,
		disabled = false
	}: {
		postId?: string | null;
		reactions: ReactionSummary[];
		disabled?: boolean;
	} = $props();

	let open = $state(false);
	let search = $state('');
	let visibleLimit = $state(140);
	let options = $state.raw<EmojiOption[]>([]);
	let loading = $state(false);
	let loadError = $state(false);
	let pending = $state(false);
	// Updated locally after submissions, and refreshed when the server props change.
	let displayed = $derived(reactions);
	const action = $derived(
		`?${new URLSearchParams([...page.url.searchParams.entries()].filter(([key]) => !key.startsWith('/')))}&/setReaction`
	);
	const atLimit = $derived(displayed.length >= MAX_REACTION_EMOJIS);
	const existing = $derived(new Map(displayed.map((reaction) => [reaction.emoji, reaction])));
	const matches = $derived.by(() => {
		const query = search.trim().toLowerCase();
		const filtered = query
			? options.filter((option) =>
					`${option.name} ${option.group} ${option.emoji}`.toLowerCase().includes(query)
				)
			: options;
		return atLimit ? filtered.filter((option) => existing.has(option.emoji)) : filtered;
	});
	const groups = $derived.by(() => {
		const result = new SvelteMap<string, EmojiOption[]>();
		for (const option of matches.slice(0, visibleLimit)) {
			const entries = result.get(option.group) ?? [];
			entries.push(option);
			result.set(option.group, entries);
		}
		return [...result];
	});

	async function loadOptions(nextOpen: boolean) {
		if (!nextOpen || options.length || loading) return;
		loading = true;
		loadError = false;
		try {
			options = (await import('$shared/emoji-data')).EMOJIS;
		} catch {
			loadError = true;
		} finally {
			loading = false;
		}
	}

	const reactionEnhance: SubmitFunction = ({ cancel }) => {
		if (pending || disabled) {
			cancel();
			return;
		}
		pending = true;
		open = false;
		return async ({ result, update }) => {
			pending = false;
			if (result.type === 'success' && Array.isArray(result.data?.reactions)) {
				displayed = result.data.reactions as ReactionSummary[];
			} else if (result.type === 'failure') {
				toast.error(
					typeof result.data?.error === 'string' ? result.data.error : 'Could not update reaction.'
				);
			} else if (result.type === 'error') {
				toast.error('Could not update reaction. Please try again.');
			} else {
				await update();
			}
		};
	};
</script>

<div class="flex flex-wrap items-center gap-1.5" aria-label="Post reactions">
	{#each displayed as reaction (reaction.emoji)}
		<form method="POST" {action} use:enhance={reactionEnhance}>
			<input type="hidden" name="postId" value={postId ?? ''} />
			<input type="hidden" name="emoji" value={reaction.emoji} />
			<input type="hidden" name="mode" value={reaction.reacted ? 'remove' : 'add'} />
			<button
				type="submit"
				disabled={disabled || pending}
				aria-pressed={reaction.reacted}
				aria-label={`${reaction.name}: ${reaction.count} ${reaction.count === 1 ? 'reaction' : 'reactions'}. ${reaction.reacted ? 'Remove your reaction' : 'Add your reaction'}`}
				title={`${reaction.name}${reaction.reacted ? ' (you reacted)' : ''}`}
				class={[
					'inline-flex h-7 items-center gap-1.5 rounded-full border px-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default',
					reaction.reacted
						? 'border-primary/50 bg-primary/10 text-primary'
						: 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'
				]}
			>
				<span class="reaction-emoji text-base" aria-hidden="true">{reaction.emoji}</span>
				<span>{reaction.count}</span>
			</button>
		</form>
	{/each}
	{#if !disabled}
		<Popover.Root bind:open onOpenChange={loadOptions}>
			<Popover.Trigger
				class="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
				aria-label="Add a reaction"
				title="Add a reaction"
			>
				<SmilePlusIcon class="size-4" />
			</Popover.Trigger>
			<Popover.Content align="start" class="w-80 max-w-[calc(100vw-2rem)] p-3">
				<label class="sr-only" for="emoji-search-{postId ?? 'opening'}">Search emojis</label>
				<input
					id="emoji-search-{postId ?? 'opening'}"
					type="search"
					bind:value={search}
					oninput={() => (visibleLimit = 140)}
					placeholder="Search emojis"
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
				{#if atLimit}
					<p class="text-xs text-muted-foreground">
						This post has {MAX_REACTION_EMOJIS} different emojis. Choose an existing reaction.
					</p>
				{/if}
				<div class="max-h-72 overflow-y-auto overscroll-contain">
					{#if loading}
						<p class="p-2 text-sm text-muted-foreground" role="status">Loading emojis...</p>
					{:else if loadError}
						<button type="button" class="p-2 text-sm underline" onclick={() => loadOptions(true)}
							>Retry loading emojis</button
						>
					{:else if !matches.length}
						<p class="p-2 text-sm text-muted-foreground">No emojis found.</p>
					{:else}
						{#each groups as [group, entries] (group)}
							<p class="sticky top-0 bg-popover py-2 text-xs font-medium text-muted-foreground">
								{group}
							</p>
							<div class="grid grid-cols-7 gap-1">
								{#each entries as option (option.emoji)}
									<form method="POST" {action} use:enhance={reactionEnhance}>
										<input type="hidden" name="postId" value={postId ?? ''} />
										<input type="hidden" name="emoji" value={option.emoji} />
										<input
											type="hidden"
											name="mode"
											value={existing.get(option.emoji)?.reacted ? 'remove' : 'add'}
										/>
										<button
											type="submit"
											disabled={pending}
											title={option.name}
											aria-label={option.name}
											aria-pressed={existing.get(option.emoji)?.reacted ?? false}
											class="flex size-9 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-primary/15"
										>
											<span class="reaction-emoji text-2xl" aria-hidden="true">{option.emoji}</span>
										</button>
									</form>
								{/each}
							</div>
						{/each}
						{#if matches.length > visibleLimit}
							<button
								type="button"
								class="mt-2 w-full rounded-md p-2 text-sm hover:bg-muted"
								onclick={() => (visibleLimit += 140)}>Show more emojis</button
							>
						{/if}
					{/if}
				</div>
			</Popover.Content>
		</Popover.Root>
	{/if}
</div>
