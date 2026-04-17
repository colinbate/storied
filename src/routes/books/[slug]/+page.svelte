<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import HeartIcon from '@lucide/svelte/icons/heart';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	const statusLabels: Record<string, string> = {
		want_to_read: 'Want to Read',
		reading: 'Reading',
		read: 'Read',
		dnf: 'Did Not Finish',
		pass: 'Pass'
	};

	const statusOptions = Object.entries(statusLabels);
</script>

<svelte:head>
	<title>{data.book.title} — Storied</title>
</svelte:head>

<div class="space-y-6">
	<a
		href={resolve('/')}
		class="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
	>
		<ArrowLeftIcon class="h-4 w-4" />
		Back to Discussions
	</a>

	<!-- Book header -->
	<div class="flex flex-col gap-6 sm:flex-row">
		{#if data.book.coverUrl}
			<img
				src={data.book.coverUrl}
				alt={data.book.title}
				class="h-48 w-32 shrink-0 self-start rounded-lg object-cover shadow-md"
			/>
		{:else}
			<div
				class="flex h-48 w-32 shrink-0 items-center justify-center rounded-lg bg-muted shadow-md"
			>
				<BookOpenIcon class="h-10 w-10 text-muted-foreground" />
			</div>
		{/if}

		<div class="flex-1 space-y-3">
			<div>
				<h1 class="text-2xl font-bold">{data.book.title}</h1>
				{#if data.book.subtitle}
					<p class="text-lg text-muted-foreground">{data.book.subtitle}</p>
				{/if}
				{#if data.book.authorText}
					<p class="mt-1 text-muted-foreground">by {data.book.authorText}</p>
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-2">
				{#if data.book.firstPublishYear}
					<Badge variant="outline">{data.book.firstPublishYear}</Badge>
				{/if}
				{#if data.book.isbn13}
					<Badge variant="outline">ISBN {data.book.isbn13}</Badge>
				{/if}
				{#if data.book.goodreadsUrl}
					<a
						href={data.book.goodreadsUrl}
						target="_blank"
						rel="noopener noreferrer external"
						class="inline-flex items-center gap-1 text-sm text-primary hover:underline"
					>
						<ExternalLinkIcon class="h-3.5 w-3.5" />
						Goodreads
					</a>
				{/if}
			</div>

			<!-- Stats -->
			<div class="flex items-center gap-4 text-sm text-muted-foreground">
				<span class="flex items-center gap-1">
					<HeartIcon class="h-4 w-4" />
					{data.stats.recommendations}
					{data.stats.recommendations === 1 ? 'recommendation' : 'recommendations'}
				</span>
				<span class="flex items-center gap-1">
					<UsersIcon class="h-4 w-4" />
					{data.stats.readers}
					{data.stats.readers === 1 ? 'reader' : 'readers'}
				</span>
			</div>

			<!-- User actions -->
			<div class="flex flex-wrap items-center gap-3">
				<form
					method="POST"
					action="?/updateStatus"
					use:enhance={() => {
						return async ({ result, update }) => {
							await update();
							if (result.type === 'success') toast.success('Reading status updated!');
						};
					}}
					class="flex items-center gap-2"
				>
					<select
						name="readingStatus"
						class="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					>
						<option value="" disabled selected={!data.myBookRelation}>Track this book…</option>
						{#each statusOptions as [value, label] (value)}
							<option {value} selected={data.myBookRelation?.readingStatus === value}
								>{label}</option
							>
						{/each}
					</select>
				</form>

				<form
					method="POST"
					action="?/toggleRecommend"
					use:enhance={() => {
						return async ({ result, update }) => {
							await update();
							if (result.type === 'success') toast.success('Recommendation updated!');
						};
					}}
				>
					<Button
						variant={data.myBookRelation?.isRecommended ? 'default' : 'outline'}
						size="sm"
						type="submit"
					>
						<HeartIcon class="h-4 w-4" />
						{data.myBookRelation?.isRecommended ? 'Recommended' : 'Recommend'}
					</Button>
				</form>
			</div>
		</div>
	</div>

	{#if data.book.description}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Description</Card.Title>
			</Card.Header>
			<Card.Content>
				<p class="text-sm leading-relaxed text-muted-foreground">{data.book.description}</p>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Related Threads -->
	{#if data.relatedThreads.length > 0}
		<Separator />
		<section>
			<h2 class="mb-3 text-lg font-semibold">Mentioned In</h2>
			<div class="space-y-2">
				{#each data.relatedThreads as { thread, author } (thread.id)}
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
									<h3 class="truncate font-medium">{thread.title}</h3>
									<div class="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
										<span>{author.displayName}</span>
										<span>·</span>
										<span>{new Date(thread.createdAt).toLocaleDateString()}</span>
										{#if thread.replyCount > 0}
											<span>·</span>
											<Badge variant="secondary" class="px-1.5 py-0 text-xs">
												{thread.replyCount}
												{thread.replyCount === 1 ? 'reply' : 'replies'}
											</Badge>
										{/if}
									</div>
								</div>
							</Card.Content>
						</Card.Root>
					</a>
				{/each}
			</div>
		</section>
	{/if}
</div>
