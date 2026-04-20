<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import PinIcon from '@lucide/svelte/icons/pin';
	import LockIcon from '@lucide/svelte/icons/lock';
	import { resolve } from '$app/paths';

	let { data } = $props();
</script>

<svelte:head>
	<title>Bermuda Triangle Society Discussions — Storied</title>
</svelte:head>

<div class="space-y-8">
	<!-- Header section -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold">Discussions</h1>
			<p class="text-muted-foreground">Bermuda Triangle Society community forum</p>
		</div>
		<Button href="/new">
			<PlusIcon class="h-4 w-4" />
			New Thread
		</Button>
	</div>

	<!-- Categories -->
	<section>
		<h2 class="mb-3 text-lg font-semibold">Categories</h2>
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.categories as category (category.id)}
				<a href={resolve(`/category/${category.slug}`)} class="block">
					<Card.Root class="h-full transition-colors hover:border-primary/50">
						<Card.Header class="flex flex-row justify-between pb-2">
							<Card.Title class="text-base">{category.name}</Card.Title>
							<Badge variant="secondary" class="px-1.5 py-0 text-xs"
								>{category.size}
								{category.size === 1 ? 'thread' : 'threads'}</Badge
							>
						</Card.Header>
						{#if category.description}
							<Card.Content>
								<p class="text-sm text-muted-foreground">{category.description}</p>
							</Card.Content>
						{/if}
					</Card.Root>
				</a>
			{/each}
		</div>
	</section>

	<Separator />

	<!-- Recent Threads -->
	<section>
		<h2 class="mb-3 text-lg font-semibold">Recent Threads</h2>
		{#if data.recentThreads.length === 0}
			<Card.Root>
				<Card.Content class="py-12 text-center text-muted-foreground">
					<MessageSquareIcon class="mx-auto mb-3 h-8 w-8 opacity-50" />
					<p>No threads yet. Be the first to start a discussion!</p>
				</Card.Content>
			</Card.Root>
		{:else}
			<div class="space-y-3">
				{#each data.recentThreads as { thread, author } (thread.id)}
					<a href={resolve(`/thread/${thread.slug}`)} class="block">
						<Card.Root class="transition-colors hover:border-primary/30">
							<Card.Content class="flex items-center gap-3">
								<Avatar.Root class="h-8 w-8 shrink-0">
									{#if author.avatarUrl}
										<Avatar.Image src={author.avatarUrl} alt={author.displayName} />
									{/if}
									<Avatar.Fallback class="text-xs"
										>{author.displayName.charAt(0).toUpperCase()}</Avatar.Fallback
									>
								</Avatar.Root>
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<h3 class="truncate text-base font-medium">{thread.title}</h3>
										{#if thread.isPinned}
											<PinIcon class="h-3.5 w-3.5 shrink-0 text-primary" />
										{/if}
										{#if thread.isLocked}
											<LockIcon class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
										{/if}
									</div>
									<div class="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
										<span>{author.displayName}</span>
										<span>·</span>
										<span>{new Date(thread.createdAt).toLocaleDateString()}</span>
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
	</section>
</div>
