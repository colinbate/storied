<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import BellIcon from '@lucide/svelte/icons/bell';
	import BellOffIcon from '@lucide/svelte/icons/bell-off';
	import PinIcon from '@lucide/svelte/icons/pin';
	import LockIcon from '@lucide/svelte/icons/lock';
	import ReplyIcon from '@lucide/svelte/icons/reply';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';

	let { data, form } = $props();
	let replyBody = $state('');
	let loading = $state(false);
	let replyingTo = $state<string | null>(null);

	function getInitial(name: string) {
		return name.charAt(0).toUpperCase();
	}
</script>

<svelte:head>
	<title>{data.thread.title} — Storied</title>
</svelte:head>

<div class="space-y-6">
	<!-- Back + thread header -->
	<div>
		<a
			href={resolve('/')}
			class="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			<ArrowLeftIcon class="h-4 w-4" />
			Back to Discussions
		</a>

		<div class="flex items-start justify-between gap-4">
			<div>
				<div class="flex items-center gap-2">
					<h1 class="text-2xl font-bold">{data.thread.title}</h1>
					{#if data.thread.isPinned}
						<PinIcon class="h-4 w-4 text-primary" />
					{/if}
					{#if data.thread.isLocked}
						<LockIcon class="h-4 w-4 text-muted-foreground" />
					{/if}
				</div>
				<div class="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
					<span>{data.author.displayName}</span>
					<span>·</span>
					<span>{new Date(data.thread.createdAt).toLocaleDateString()}</span>
					{#if data.thread.replyCount > 0}
						<span>·</span>
						<span
							>{data.thread.replyCount}
							{data.thread.replyCount === 1 ? 'reply' : 'replies'}</span
						>
					{/if}
				</div>
			</div>

			<form method="POST" action="?/subscribe" use:enhance>
				<Button variant="outline" size="sm" type="submit">
					{#if data.isSubscribed}
						<BellOffIcon class="mr-1 h-4 w-4" />
						Unwatch
					{:else}
						<BellIcon class="mr-1 h-4 w-4" />
						Watch
					{/if}
				</Button>
			</form>
		</div>
	</div>

	<!-- Thread body (the opening post) -->
	<Card.Root>
		<Card.Content class="pt-4">
			<div class="flex items-start gap-3">
				<Avatar.Root class="h-10 w-10 shrink-0">
					{#if data.author.avatarUrl}
						<Avatar.Image src={data.author.avatarUrl} alt={data.author.displayName} />
					{/if}
					<Avatar.Fallback>{getInitial(data.author.displayName)}</Avatar.Fallback>
				</Avatar.Root>
				<div class="min-w-0 flex-1">
					<div class="mb-2 flex items-center gap-2">
						<span class="font-medium">{data.author.displayName}</span>
						<span class="text-xs text-muted-foreground"
							>{new Date(data.thread.createdAt).toLocaleString()}</span
						>
					</div>
					<div class="prose prose-sm max-w-none dark:prose-invert">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html data.thread.bodyHtml}
					</div>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Replies -->
	{#if data.posts.length > 0}
		<Separator />
		<h2 class="text-lg font-semibold">
			{data.posts.length}
			{data.posts.length === 1 ? 'Reply' : 'Replies'}
		</h2>

		<div class="space-y-3">
			{#each data.posts as { post, author } (post.id)}
				<Card.Root id="post-{post.id}">
					<Card.Content class="pt-4">
						<div class="flex items-start gap-3">
							<Avatar.Root class="h-8 w-8 shrink-0">
								{#if author.avatarUrl}
									<Avatar.Image src={author.avatarUrl} alt={author.displayName} />
								{/if}
								<Avatar.Fallback class="text-xs">{getInitial(author.displayName)}</Avatar.Fallback>
							</Avatar.Root>
							<div class="min-w-0 flex-1">
								<div class="mb-2 flex items-center gap-2">
									<span class="text-sm font-medium">{author.displayName}</span>
									<span class="text-xs text-muted-foreground"
										>{new Date(post.createdAt).toLocaleString()}</span
									>
									{#if post.parentPostId}
										<a
											href="#post-{post.parentPostId}"
											class="text-xs text-primary hover:underline"
										>
											<ReplyIcon class="inline h-3 w-3" /> in reply
										</a>
									{/if}
								</div>
								<div class="prose prose-sm max-w-none dark:prose-invert">
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html post.bodyHtml}
								</div>
								{#if !data.thread.isLocked}
									<button
										type="button"
										class="mt-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
										onclick={() => {
											replyingTo = replyingTo === post.id ? null : post.id;
										}}
									>
										<ReplyIcon class="mr-1 inline h-3 w-3" />
										Reply
									</button>
								{/if}
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}

	<!-- Reply form -->
	{#if !data.thread.isLocked}
		<Separator />
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">
					{#if replyingTo}
						Replying to a post
						<button
							type="button"
							class="ml-2 text-sm text-muted-foreground hover:text-foreground"
							onclick={() => {
								replyingTo = null;
							}}
						>
							(cancel)
						</button>
					{:else}
						Post a Reply
					{/if}
				</Card.Title>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/reply"
					use:enhance={() => {
						loading = true;
						return async ({ result, update }) => {
							loading = false;
							await update();
							if (result.type === 'success') {
								replyBody = '';
								replyingTo = null;
								toast.success('Reply posted!');
							}
						};
					}}
					class="space-y-3"
				>
					{#if replyingTo}
						<input type="hidden" name="parentPostId" value={replyingTo} />
					{/if}
					<Textarea
						name="body"
						placeholder="Write your reply… (Markdown supported)"
						rows={4}
						bind:value={replyBody}
						required
					/>
					{#if form?.error}
						<p class="text-sm text-destructive">{form.error}</p>
					{/if}
					<div class="flex justify-end">
						<Button type="submit" disabled={loading || !replyBody.trim()}>
							{loading ? 'Posting…' : 'Post Reply'}
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Content class="py-8 text-center text-muted-foreground">
				<LockIcon class="mx-auto mb-2 h-5 w-5" />
				<p>This thread is locked. No new replies can be posted.</p>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
