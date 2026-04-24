<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import ConfirmButton from '$lib/components/confirm-button.svelte';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { formatDate } from '$lib/date-format';

	let { data } = $props();
	const timeZone = $derived(data.user?.timezone);

	const restoreEnhance: SubmitFunction = () => {
		return async ({ result, update }) => {
			await update();
			if (result.type === 'success') {
				toast.success('Restored.');
			}
		};
	};
</script>

<svelte:head>
	<title>Moderation — Admin — Storied</title>
</svelte:head>

<div class="space-y-8">
	<div>
		<h1 class="text-2xl font-bold">Moderation</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Deleted threads and posts deleted within the last 7 days. Moderation actions on live content
			are available in place on the thread itself.
		</p>
	</div>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold">Deleted Threads</h2>
		<Card.Root>
			<Card.Content class="p-0">
				<div class="divide-y">
					{#each data.deletedThreads as { thread, author } (thread.id)}
						<div class="flex items-center justify-between gap-4 px-4 py-3">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<a
										href={resolve(`/thread/${thread.slug}`)}
										class="truncate font-medium hover:underline"
									>
										{thread.title}
									</a>
									<Badge variant="destructive" class="shrink-0">Deleted</Badge>
								</div>
								<div class="mt-0.5 text-sm text-muted-foreground">
									by {author.displayName} · deleted {thread.deletedAt
										? formatDate(thread.deletedAt, { time: 'always', timeZone })
										: ''}
								</div>
							</div>
							<ConfirmButton
								confirmText="Restore this thread?"
								formAction="?/restoreThread"
								formData={{ threadId: thread.id }}
								enhance={restoreEnhance}
								variant="outline"
								size="sm"
							>
								<RotateCcwIcon class="h-4 w-4" />
								Restore
							</ConfirmButton>
						</div>
					{:else}
						<div class="py-8 text-center text-sm text-muted-foreground">No deleted threads.</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold">Recently Deleted Posts</h2>
		<p class="text-sm text-muted-foreground">
			Posts deleted within the last 7 days can be restored.
		</p>
		<Card.Root>
			<Card.Content class="p-0">
				<div class="divide-y">
					{#each data.deletedPosts as { post, thread, author } (post.id)}
						<div class="flex items-start justify-between gap-4 px-4 py-3">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="text-sm text-muted-foreground">in</span>
									<a
										href={resolve(`/thread/${thread.slug}`)}
										class="truncate text-sm font-medium hover:underline"
									>
										{thread.title}
									</a>
								</div>
								<div class="mt-0.5 text-sm text-muted-foreground">
									by {author.displayName} · deleted {post.deletedAt
										? formatDate(post.deletedAt, { time: 'always', timeZone })
										: ''}
								</div>
								<div class="prose prose-sm mt-2 max-w-none text-muted-foreground dark:prose-invert">
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html post.bodyHtml}
								</div>
							</div>
							<ConfirmButton
								confirmText="Restore this post?"
								formAction="?/restorePost"
								formData={{ postId: post.id }}
								enhance={restoreEnhance}
								variant="outline"
								size="sm"
							>
								<RotateCcwIcon class="h-4 w-4" />
								Restore
							</ConfirmButton>
						</div>
					{:else}
						<div class="py-8 text-center text-sm text-muted-foreground">
							No recently deleted posts.
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	</section>
</div>
