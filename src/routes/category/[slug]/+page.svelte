<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import PinIcon from '@lucide/svelte/icons/pin';
	import LockIcon from '@lucide/svelte/icons/lock';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { resolve } from '$app/paths';
	import { formatDate } from '$lib/date-format';

	let { data } = $props();
	const timeZone = $derived(data.user?.timezone);
</script>

<svelte:head>
	<title>{data.category.name} — Storied</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<a
			href={resolve('/')}
			class="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			<ArrowLeftIcon class="h-4 w-4" />
			Back to Discussions
		</a>
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold">{data.category.name}</h1>
				{#if data.category.description}
					<p class="text-muted-foreground">{data.category.description}</p>
				{/if}
			</div>
			<Button href={resolve(`/new?category=${data.category.slug}`)}>
				<PlusIcon class="h-4 w-4" />
				New Thread
			</Button>
		</div>
	</div>

	{#if data.threads.length === 0}
		<Card.Root>
			<Card.Content class="py-12 text-center text-muted-foreground">
				<MessageSquareIcon class="mx-auto mb-3 h-8 w-8 opacity-50" />
				<p>No threads in this category yet.</p>
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="space-y-2">
			{#each data.threads as { thread, author } (thread.id)}
				<a href={resolve(`/thread/${thread.slug}`)} class="block">
					<Card.Root class="transition-colors hover:border-primary/30">
						<Card.Content class="flex items-start gap-3 py-3">
							<Avatar.Root class="mt-0.5 h-8 w-8 shrink-0">
								{#if author.avatarUrl}
									<Avatar.Image src={author.avatarUrl} alt={author.displayName} />
								{/if}
								<Avatar.Fallback class="text-xs"
									>{author.displayName.charAt(0).toUpperCase()}</Avatar.Fallback
								>
							</Avatar.Root>
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<h3 class="truncate font-medium">{thread.title}</h3>
									{#if thread.isPinned}
										<PinIcon class="h-3.5 w-3.5 shrink-0 text-primary" />
									{/if}
									{#if thread.isLocked}
										<LockIcon class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
									{/if}
								</div>
								<div class="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
									<span>{author.displayName}</span>
									<span>·</span>
									<span>{formatDate(thread.createdAt, { time: 'never', timeZone })}</span>
									{#if thread.replyCount > 0}
										<span>·</span>
										<Badge variant="secondary" class="px-1.5 py-0 text-xs"
											>{thread.replyCount}
											{thread.replyCount === 1 ? 'reply' : 'replies'}</Badge
										>
									{/if}
								</div>
							</div>
						</Card.Content>
					</Card.Root>
				</a>
			{/each}
		</div>
	{/if}
</div>
