<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import PinIcon from '@lucide/svelte/icons/pin';
	import PinOffIcon from '@lucide/svelte/icons/pin-off';
	import LockIcon from '@lucide/svelte/icons/lock';
	import UnlockIcon from '@lucide/svelte/icons/lock-open';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import { resolve } from '$app/paths';

	let { data } = $props();
</script>

<svelte:head>
	<title>Moderation — Admin — Storied</title>
</svelte:head>

<div class="space-y-6">
	<h1 class="text-2xl font-bold">Moderation</h1>

	<Card.Root>
		<Card.Content class="p-0">
			<div class="divide-y">
				{#each data.threads as { thread, author } (thread.id)}
					<div class="flex items-center justify-between gap-4 px-4 py-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<a
									href={resolve(`/thread/${thread.slug}`)}
									class="truncate font-medium hover:underline"
								>
									{thread.title}
								</a>
								{#if thread.isPinned}
									<Badge variant="secondary" class="shrink-0">Pinned</Badge>
								{/if}
								{#if thread.isLocked}
									<Badge variant="outline" class="shrink-0">Locked</Badge>
								{/if}
								{#if thread.deletedAt}
									<Badge variant="destructive" class="shrink-0">Deleted</Badge>
								{/if}
							</div>
							<p class="text-sm text-muted-foreground">
								by {author.displayName} · {new Date(thread.createdAt).toLocaleDateString()}
							</p>
						</div>
						<div class="flex shrink-0 items-center gap-1">
							<form method="POST" action="?/togglePin" use:enhance>
								<input type="hidden" name="threadId" value={thread.id} />
								<Button
									variant="ghost"
									size="icon"
									class="h-8 w-8"
									type="submit"
									title={thread.isPinned ? 'Unpin' : 'Pin'}
								>
									{#if thread.isPinned}
										<PinOffIcon class="h-4 w-4" />
									{:else}
										<PinIcon class="h-4 w-4" />
									{/if}
								</Button>
							</form>
							<form method="POST" action="?/toggleLock" use:enhance>
								<input type="hidden" name="threadId" value={thread.id} />
								<Button
									variant="ghost"
									size="icon"
									class="h-8 w-8"
									type="submit"
									title={thread.isLocked ? 'Unlock' : 'Lock'}
								>
									{#if thread.isLocked}
										<UnlockIcon class="h-4 w-4" />
									{:else}
										<LockIcon class="h-4 w-4" />
									{/if}
								</Button>
							</form>
							{#if thread.deletedAt}
								<form method="POST" action="?/restore" use:enhance>
									<input type="hidden" name="threadId" value={thread.id} />
									<Button variant="ghost" size="icon" class="h-8 w-8" type="submit" title="Restore">
										<RotateCcwIcon class="h-4 w-4" />
									</Button>
								</form>
							{:else}
								<form method="POST" action="?/softDelete" use:enhance>
									<input type="hidden" name="threadId" value={thread.id} />
									<Button
										variant="ghost"
										size="icon"
										class="h-8 w-8 text-destructive hover:text-destructive"
										type="submit"
										title="Delete"
									>
										<TrashIcon class="h-4 w-4" />
									</Button>
								</form>
							{/if}
						</div>
					</div>
				{/each}
				{#if data.threads.length === 0}
					<div class="py-12 text-center text-muted-foreground">
						<p>No threads to moderate.</p>
					</div>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>
</div>
