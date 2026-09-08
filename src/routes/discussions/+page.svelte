<script lang="ts">
	import { resolve } from '$app/paths';
	import { pageTitle } from '$shared/brand';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import DiscussionNav from '$lib/components/discussion-nav.svelte';
	import ThreadParticipants from '$lib/components/thread-participants.svelte';
	import MemberName from '$lib/components/member-name.svelte';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PinIcon from '@lucide/svelte/icons/pin';
	import LockIcon from '@lucide/svelte/icons/lock';
	import { formatDate } from '$lib/date-format';

	let { data } = $props();
	const timeZone = $derived(data.user?.timezone);

	function categoryName(categoryId: string) {
		return data.categories.find((category) => category.id === categoryId)?.name;
	}
</script>

<svelte:head>
	<title>{pageTitle('Discussions')}</title>
</svelte:head>

<div class="space-y-8">
	<DiscussionNav categories={data.categories} />

	<div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold">Discussions</h1>
			<p class="text-muted-foreground">Club conversations, recommendations, and announcements.</p>
		</div>
		<Button href={resolve('/new')}>
			<PlusIcon class="h-4 w-4" />
			New Thread
		</Button>
	</div>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold">Browse by Category</h2>
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.categories as category (category.id)}
				<a href={resolve('/category/[slug]', { slug: category.slug })} class="block">
					<Card.Root class="h-full transition-colors hover:border-primary/40">
						<Card.Header>
							<div class="flex items-start justify-between gap-3">
								<Card.Title class="text-base">{category.name}</Card.Title>
								<Badge variant="secondary">{category.size}</Badge>
							</div>
							{#if category.description}
								<Card.Description>{category.description}</Card.Description>
							{/if}
						</Card.Header>
					</Card.Root>
				</a>
			{/each}
		</div>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold">Recent Discussions</h2>
		{#if data.recentThreads.length === 0}
			<Card.Root>
				<Card.Content class="py-12 text-center text-muted-foreground">
					<MessageSquareIcon class="mx-auto mb-3 h-8 w-8 opacity-50" />
					<p>No discussions yet. Be the first to start one.</p>
				</Card.Content>
			</Card.Root>
		{:else}
			<div class="space-y-3">
				{#each data.recentThreads as { thread, author, participants, unreadCount } (thread.id)}
					<a href={resolve('/thread/[slug]', { slug: thread.slug })} class="block">
						<Card.Root class="transition-colors hover:border-primary/30">
							<Card.Content class="flex items-center gap-3">
								<Avatar.Root class="h-8 w-8 shrink-0">
									{#if author.avatarUrl}
										<Avatar.Image src={author.avatarUrl} alt={author.displayName} />
									{/if}
									<Avatar.Fallback class="text-xs">
										{author.displayName.charAt(0).toUpperCase()}
									</Avatar.Fallback>
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
										{#if thread.containsSpoilers}
											<Badge variant="secondary" class="shrink-0 px-1.5 py-0 text-xs"
												>Spoilers</Badge
											>
										{/if}
										{#if unreadCount > 0}
											<Badge class="shrink-0 px-1.5 py-0 text-xs">
												{unreadCount} new
											</Badge>
										{/if}
									</div>
									<div
										class="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
									>
										{#if categoryName(thread.categoryId)}
											<Badge variant="outline" class="px-1.5 py-0 text-xs">
												{categoryName(thread.categoryId)}
											</Badge>
										{/if}
										<MemberName userId={author.id} name={author.displayName} />
										<span>·</span>
										<span
											>{formatDate(thread.lastPostAt ?? thread.createdAt, {
												time: 'never',
												timeZone
											})}</span
										>
										{#if thread.replyCount > 0}
											<span>·</span>
											<span
												>{thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}</span
											>
										{/if}
									</div>
								</div>
								{#if participants.length > 0}
									<ThreadParticipants {participants} class="max-w-52 shrink-0" />
								{/if}
							</Card.Content>
						</Card.Root>
					</a>
				{/each}
			</div>
		{/if}
	</section>
</div>
