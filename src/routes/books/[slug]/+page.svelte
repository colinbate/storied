<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import HeartIcon from '@lucide/svelte/icons/heart';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { toast } from 'svelte-sonner';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import { formatDate } from '$lib/date-format';

	let { data } = $props();
	const timeZone = $derived(data.user?.timezone);

	const statusLabels: Record<string, string> = {
		want_to_read: 'Want to Read',
		reading: 'Reading',
		read: 'Read',
		dnf: 'Did Not Finish',
		pass: 'Pass'
	};

	const statusOptions = Object.entries(statusLabels);

	function statusLabel(status: string) {
		return statusLabels[status] ?? status;
	}
</script>

<svelte:head>
	<title>{data.book.title} — The Archive</title>
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

			<div class="space-y-2">
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
					{#if data.permissions.has('book:edit')}
						<Button
							variant="outline"
							size="sm"
							href={resolve('/admin/books/[slug]', { slug: data.book.slug })}
						>
							<ExternalLinkIcon class="h-3.5 w-3.5" />
							Book Admin
						</Button>
					{/if}
				</div>
				{#if data.bookGenres.length > 0}
					<div class="flex flex-wrap items-center gap-2">
						{#each data.bookGenres as genre (genre.id)}
							<Badge variant="secondary">{genre.name}</Badge>
						{/each}
					</div>
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
			<div class="space-y-3">
				<div class="flex flex-wrap items-center gap-3">
					<form
						method="POST"
						action="?/updateStatus"
						use:enhance={() => {
							return async ({ result, update }) => {
								await update({ reset: false });
								if (result.type === 'success') toast.success('Reading status updated!');
							};
						}}
					>
						<NativeSelect
							name="readingStatus"
							onchange={(e) => e.currentTarget.form?.requestSubmit()}
						>
							<NativeSelectOption
								value=""
								disabled
								selected={!data.myBookRelation ||
									data.myBookRelation.readingStatus === 'want_to_read'}
							>
								Track this book...
							</NativeSelectOption>
							{#each statusOptions as [value, label] (value)}
								<NativeSelectOption {value} selected={data.myBookRelation?.readingStatus === value}
									>{label}</NativeSelectOption
								>
							{/each}
							<NativeSelectOption value="__clear__">Clear status</NativeSelectOption>
						</NativeSelect>
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

				<details class="rounded-lg border border-border">
					<summary class="cursor-pointer px-4 py-3 font-medium">
						{data.myBookRelation?.note ? 'Edit Review / Notes' : 'Add Review / Notes'}
					</summary>
					<form
						method="POST"
						action="?/updateNote"
						use:enhance={() => {
							return async ({ result, update }) => {
								await update({ reset: false });
								if (result.type === 'success') toast.success('Review updated!');
							};
						}}
						class="space-y-3 border-t border-border/60 px-4 py-4"
					>
						<Textarea
							name="note"
							rows={4}
							placeholder="Add a review or note about your experience with this book"
							value={data.myBookRelation?.note ?? ''}
						/>
						<label class="flex items-center gap-2 text-sm text-muted-foreground">
							<input
								type="checkbox"
								name="containsSpoilers"
								class="rounded border-input"
								checked={data.myBookRelation?.containsSpoilers ?? false}
							/>
							This note contains spoilers
						</label>
						<div class="flex items-center gap-2">
							<Button type="submit" size="sm">Save notes</Button>
						</div>
					</form>
				</details>
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

	{#if data.memberConnections.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Member Activity</Card.Title>
				<Card.Description>
					See who has read, recommended, or left notes for this book.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				{#each data.memberConnections as item (item.member.id)}
					<div class="rounded-lg border border-border/60 p-3">
						<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
							<div class="flex min-w-0 items-center gap-3">
								<Avatar.Root class="h-9 w-9 shrink-0">
									{#if item.member.avatarUrl}
										<Avatar.Image src={item.member.avatarUrl} alt={item.member.displayName} />
									{/if}
									<Avatar.Fallback>
										{item.member.displayName.charAt(0).toUpperCase()}
									</Avatar.Fallback>
								</Avatar.Root>
								<div class="min-w-0">
									{#if item.canViewProfile}
										<a
											href={resolve(`/members/${item.member.id}`)}
											class="font-medium hover:underline"
										>
											{item.member.displayName}
										</a>
									{:else}
										<p class="font-medium">{item.member.displayName}</p>
									{/if}
									<p class="text-xs text-muted-foreground">
										Updated {formatDate(item.relation.updatedAt, { timeZone })}
									</p>
								</div>
							</div>

							<div class="flex flex-wrap items-center gap-2">
								<Badge variant="outline">{statusLabel(item.relation.readingStatus)}</Badge>
								{#if item.relation.isRecommended}
									<Badge>Recommended</Badge>
								{/if}
								{#if item.relation.containsSpoilers && item.relation.note}
									<Badge variant="secondary">Spoilers</Badge>
								{/if}
							</div>
						</div>

						{#if item.relation.note}
							<details class="mt-3 text-sm text-muted-foreground">
								<summary class="cursor-pointer list-none font-medium text-foreground">
									{item.relation.containsSpoilers ? 'Show spoiler note' : 'Show note'}
								</summary>
								<p class="mt-2 rounded-md bg-muted/40 p-3 whitespace-pre-wrap">
									{item.relation.note}
								</p>
							</details>
						{/if}
					</div>
				{/each}
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
							<Card.Content class="flex items-start gap-3">
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
										<span>{formatDate(thread.createdAt, { time: 'never', timeZone })}</span>
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
