<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import BookCard from '$lib/components/BookCard.svelte';
	import ConfirmButton from '$lib/components/confirm-button.svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import BellIcon from '@lucide/svelte/icons/bell';
	import BellOffIcon from '@lucide/svelte/icons/bell-off';
	import PinIcon from '@lucide/svelte/icons/pin';
	import PinOffIcon from '@lucide/svelte/icons/pin-off';
	import LockIcon from '@lucide/svelte/icons/lock';
	import UnlockIcon from '@lucide/svelte/icons/lock-open';
	import ReplyIcon from '@lucide/svelte/icons/reply';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import XIcon from '@lucide/svelte/icons/x';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { SubmitFunction } from '@sveltejs/kit';

	let { data, form } = $props();
	let replyBody = $state('');
	let loading = $state(false);
	let replyingTo = $state<string | null>(null);

	/** Post id currently being edited (empty string = editing the thread opener) */
	let editingId = $state<string | null>(null);
	let editBody = $state('');
	let editSaving = $state(false);

	const currentUserId = $derived(data.user?.id ?? null);
	const editWindowMs = $derived(data.postEditWindowMs ?? 24 * 60 * 60 * 1000);

	function canEdit(authorId: string, createdAt: string): boolean {
		if (!currentUserId || currentUserId !== authorId) return false;
		const created = Date.parse(createdAt);
		if (Number.isNaN(created)) return false;
		return Date.now() - created < editWindowMs;
	}

	function startEditThread() {
		editingId = '';
		editBody = data.thread.bodySource;
	}

	function startEditPost(postId: string, bodySource: string) {
		editingId = postId;
		editBody = bodySource;
	}

	function cancelEdit() {
		editingId = null;
		editBody = '';
	}

	function getInitial(name: string) {
		return name.charAt(0).toUpperCase();
	}

	const editEnhance: SubmitFunction = () => {
		editSaving = true;
		return async ({ result, update }) => {
			editSaving = false;
			await update();
			if (result.type === 'success' && result.data?.edited) {
				toast.success('Updated.');
				editingId = null;
				editBody = '';
			}
		};
	};

	const modEnhance: (msg: string) => SubmitFunction = (msg) => () => {
		return async ({ result, update }) => {
			await update();
			if (result.type === 'success') {
				toast.success(msg);
			} else if (result.type === 'failure' && result.data?.error) {
				toast.error(String(result.data.error));
			}
		};
	};

	const deletePostEnhance: SubmitFunction = () => {
		return async ({ result, update }) => {
			await update();
			if (result.type === 'success') {
				toast.success('Post deleted.');
			} else if (result.type === 'failure' && result.data?.error) {
				toast.error(String(result.data.error));
			}
		};
	};
</script>

<svelte:head>
	<title>{data.thread.title} — Storied</title>
</svelte:head>

<div class="flex flex-col gap-6 lg:flex-row">
	<div class="min-w-0 flex-1 space-y-6">
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
					<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
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
						{#if data.session}
							<span>·</span>
							<Badge variant="secondary" class="gap-1 px-2 py-0 text-xs">
								<CalendarIcon class="h-3 w-3" />
								{data.session.title}
							</Badge>
							<Badge variant="outline" class="gap-1 px-2 py-0 text-xs">
								<GlobeIcon class="h-3 w-3" />
								Public
							</Badge>
						{/if}
					</div>
				</div>

				<form method="POST" action="?/subscribe" use:enhance>
					<Button variant="outline" size="sm" type="submit">
						{#if data.isSubscribed}
							<BellOffIcon class="h-4 w-4" />
							Unwatch
						{:else}
							<BellIcon class="h-4 w-4" />
							Watch
						{/if}
					</Button>
				</form>
			</div>
		</div>

		<!-- Moderation widget -->
		{#if data.canModerate}
			<Card.Root class="border-dashed">
				<Card.Content class="flex flex-wrap items-center gap-3 px-4 text-sm">
					<div class="flex items-center gap-2 text-muted-foreground">
						<ShieldIcon class="h-4 w-4" />
						<span class="font-medium">Moderator</span>
					</div>

					<form
						method="POST"
						action="?/togglePin"
						use:enhance={modEnhance(data.thread.isPinned ? 'Unpinned.' : 'Pinned.')}
					>
						<input type="hidden" name="threadId" value={data.thread.id} />
						<Button variant="outline" size="sm" type="submit">
							{#if data.thread.isPinned}
								<PinOffIcon class="h-4 w-4" />
								Unpin
							{:else}
								<PinIcon class="h-4 w-4" />
								Pin
							{/if}
						</Button>
					</form>

					<form
						method="POST"
						action="?/toggleLock"
						use:enhance={modEnhance(data.thread.isLocked ? 'Unlocked.' : 'Locked.')}
					>
						<input type="hidden" name="threadId" value={data.thread.id} />
						<Button variant="outline" size="sm" type="submit">
							{#if data.thread.isLocked}
								<UnlockIcon class="h-4 w-4" />
								Unlock
							{:else}
								<LockIcon class="h-4 w-4" />
								Lock
							{/if}
						</Button>
					</form>

					<form
						method="POST"
						action="?/linkSession"
						use:enhance={modEnhance('Session link updated.')}
						class="inline-flex items-center gap-2"
					>
						<input type="hidden" name="threadId" value={data.thread.id} />
						<label for="session-select" class="flex items-center gap-1 text-muted-foreground">
							<CalendarIcon class="h-4 w-4" />
							Session
						</label>
						<select
							id="session-select"
							name="sessionId"
							class="rounded-lg border border-input bg-transparent pr-10 pl-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
							onchange={(e) => {
								(e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
							}}
						>
							<option value="" selected={!data.thread.sessionId}>No session</option>
							{#each data.allSessions as session (session.id)}
								<option value={session.id} selected={data.thread.sessionId === session.id}>
									{session.title}
								</option>
							{/each}
						</select>
					</form>

					<div class="ml-auto">
						<ConfirmButton
							confirmText="Delete this thread?"
							formAction="?/deleteThread"
							formData={{ threadId: data.thread.id }}
							variant="outline"
							size="sm"
							class="text-destructive hover:text-destructive"
						>
							<TrashIcon class="h-4 w-4" />
							Delete Thread
						</ConfirmButton>
					</div>
				</Card.Content>
			</Card.Root>
		{/if}

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
							{#if editingId !== '' && canEdit(data.author.id, data.thread.createdAt)}
								<button
									type="button"
									class="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground"
									onclick={startEditThread}
								>
									<PencilIcon class="mr-1 inline h-3 w-3" />
									Edit
								</button>
							{/if}
						</div>
						{#if editingId === ''}
							<form method="POST" action="?/editThread" use:enhance={editEnhance} class="space-y-2">
								<Textarea name="body" rows={6} bind:value={editBody} required />
								<div class="flex justify-end gap-2">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onclick={cancelEdit}
										disabled={editSaving}
									>
										<XIcon class="h-4 w-4" />
										Cancel
									</Button>
									<Button type="submit" size="sm" disabled={editSaving || !editBody.trim()}>
										{editSaving ? 'Saving…' : 'Save'}
									</Button>
								</div>
							</form>
						{:else}
							<div class="prose prose-sm max-w-none dark:prose-invert">
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html data.thread.bodyHtml}
							</div>
						{/if}
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
									<Avatar.Fallback class="text-xs">{getInitial(author.displayName)}</Avatar.Fallback
									>
								</Avatar.Root>
								<div class="min-w-0 flex-1">
									<div class="mb-2 flex items-center gap-2">
										<span class="text-sm font-medium">{author.displayName}</span>
										<span class="text-xs text-muted-foreground"
											>{new Date(post.createdAt).toLocaleString()}</span
										>
										{#if post.editCount > 0}
											<span class="text-xs text-muted-foreground italic">(edited)</span>
										{/if}
										{#if post.parentPostId}
											<a
												href="#post-{post.parentPostId}"
												class="text-xs text-primary hover:underline"
											>
												<ReplyIcon class="inline h-3 w-3" /> in reply
											</a>
										{/if}
									</div>
									{#if editingId === post.id}
										<form
											method="POST"
											action="?/editPost"
											use:enhance={editEnhance}
											class="space-y-2"
										>
											<input type="hidden" name="postId" value={post.id} />
											<Textarea name="body" rows={4} bind:value={editBody} required />
											<div class="flex justify-end gap-2">
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onclick={cancelEdit}
													disabled={editSaving}
												>
													<XIcon class="h-4 w-4" />
													Cancel
												</Button>
												<Button type="submit" size="sm" disabled={editSaving || !editBody.trim()}>
													{editSaving ? 'Saving…' : 'Save'}
												</Button>
											</div>
										</form>
									{:else}
										<div class="prose prose-sm max-w-none dark:prose-invert">
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											{@html post.bodyHtml}
										</div>
										<div class="mt-2 flex flex-wrap items-center gap-3">
											{#if !data.thread.isLocked}
												<button
													type="button"
													class="text-xs text-muted-foreground transition-colors hover:text-foreground"
													onclick={() => {
														replyingTo = replyingTo === post.id ? null : post.id;
													}}
												>
													<ReplyIcon class="mr-1 inline h-3 w-3" />
													Reply
												</button>
											{/if}
											{#if canEdit(author.id, post.createdAt)}
												<button
													type="button"
													class="text-xs text-muted-foreground transition-colors hover:text-foreground"
													onclick={() => startEditPost(post.id, post.bodySource)}
												>
													<PencilIcon class="mr-1 inline h-3 w-3" />
													Edit
												</button>
											{/if}
											{#if data.canModerate}
												<ConfirmButton
													confirmText="Delete this post?"
													formAction="?/deletePost"
													formData={{ postId: post.id }}
													enhance={deletePostEnhance}
													variant="ghost"
													size="sm"
													class="h-auto px-0 py-0 text-xs text-muted-foreground hover:bg-transparent hover:text-destructive"
												>
													<TrashIcon class="mr-1 inline h-3 w-3" />
													Delete
												</ConfirmButton>
											{/if}
										</div>
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
								{#if loading}Posting…{:else if data.session}<GlobeIcon class="size-4" /> Post Public Reply{:else}Post
									Reply{/if}
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

	{#if data.books.length > 0}
		<aside class="w-full shrink-0 lg:w-64">
			<div class="sticky top-20">
				<h3 class="mb-3 text-sm font-semibold text-muted-foreground">Books Mentioned</h3>
				<div class="space-y-2">
					{#each data.books as book (book.id)}
						<BookCard {book} compact />
					{/each}
				</div>
			</div>
		</aside>
	{/if}
</div>
