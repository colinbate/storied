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
	import LibraryBigIcon from '@lucide/svelte/icons/library-big';
	import CheckCircle2Icon from '@lucide/svelte/icons/check-circle-2';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import { toast } from 'svelte-sonner';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import { formatDate } from '$lib/date-format';

	let { data } = $props();
	const timeZone = $derived(data.user?.timezone);

	const statusLabels: Record<string, string> = {
		want_to_read: 'Want to Read',
		reading: 'Reading',
		read: 'Read',
		did_not_finish: 'Did Not Finish'
	};

	const statusOptions = Object.entries(statusLabels);
</script>

<svelte:head>
	<title>{data.series.title} — The Archive</title>
</svelte:head>

<div class="space-y-6">
	<a
		href={resolve('/')}
		class="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
	>
		<ArrowLeftIcon class="h-4 w-4" />
		Back to Discussions
	</a>

	<div class="flex flex-col gap-6 sm:flex-row">
		{#if data.series.coverUrl}
			<img
				src={data.series.coverUrl}
				alt={data.series.title}
				class="h-48 w-32 shrink-0 self-start rounded-lg object-cover shadow-md"
			/>
		{:else}
			<div
				class="flex h-48 w-32 shrink-0 items-center justify-center rounded-lg bg-muted shadow-md"
			>
				<LibraryBigIcon class="h-10 w-10 text-muted-foreground" />
			</div>
		{/if}

		<div class="flex-1 space-y-3">
			<div>
				<h1 class="text-2xl font-bold">{data.series.title}</h1>
				{#if data.series.authorText}
					<p class="mt-1 text-muted-foreground">by {data.series.authorText}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<div class="flex flex-wrap items-center gap-2">
					<Badge variant="outline">
						{data.series.bookCount ?? data.seriesEntries.length}
						{data.series.bookCount === 1 || data.seriesEntries.length === 1 ? ' book' : ' books'}
					</Badge>

					<Badge variant="outline" class="inline-flex items-center gap-1">
						{#if data.series.isComplete}
							<CheckCircle2Icon class="h-3.5 w-3.5" />
							Complete
						{:else}
							<CircleDashedIcon class="h-3.5 w-3.5" />
							Ongoing
						{/if}
					</Badge>

					{#if data.series.goodreadsUrl}
						<a
							href={data.series.goodreadsUrl}
							target="_blank"
							rel="noopener noreferrer external"
							class="inline-flex items-center gap-1 text-sm text-primary hover:underline"
						>
							<ExternalLinkIcon class="h-3.5 w-3.5" />
							Goodreads
						</a>
					{/if}
					{#if data.permissions.has('series:edit')}
						<Button
							variant="outline"
							size="sm"
							href={resolve('/admin/series/[slug]', { slug: data.series.slug })}
						>
							<ExternalLinkIcon class="h-3.5 w-3.5" />
							Series Admin
						</Button>
					{/if}
				</div>
				{#if data.seriesGenres.length > 0}
					<div class="flex flex-wrap items-center gap-2">
						{#each data.seriesGenres as genre (genre.id)}
							<Badge variant="secondary">{genre.name}</Badge>
						{/each}
					</div>
				{/if}
			</div>

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
					class="flex items-center gap-2"
				>
					<NativeSelect
						name="readingStatus"
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					>
						<NativeSelectOption value="" disabled selected={!data.mySeriesRelation}
							>Track this series…</NativeSelectOption
						>
						{#each statusOptions as [value, label] (value)}
							<NativeSelectOption {value} selected={data.mySeriesRelation?.readingStatus === value}>
								{label}
							</NativeSelectOption>
						{/each}
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
						variant={data.mySeriesRelation?.isRecommended ? 'default' : 'outline'}
						size="sm"
						type="submit"
					>
						<HeartIcon class="h-4 w-4" />
						{data.mySeriesRelation?.isRecommended ? 'Recommended' : 'Recommend'}
					</Button>
				</form>
			</div>
		</div>
	</div>

	{#if data.series.description}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Description</Card.Title>
			</Card.Header>
			<Card.Content>
				<p class="text-sm leading-relaxed text-muted-foreground">{data.series.description}</p>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if data.seriesEntries.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Books in This Series</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-2">
				{#each data.seriesEntries as { book, entry } (book.id)}
					<a
						href={resolve(`/books/${book.slug}`)}
						class="flex items-start gap-3 rounded-md border p-3 transition-colors hover:border-primary/30"
					>
						{#if book.coverUrl}
							<img
								src={book.coverUrl}
								alt={book.title}
								class="h-16 w-11 shrink-0 rounded object-cover"
							/>
						{:else}
							<div class="flex h-16 w-11 shrink-0 items-center justify-center rounded bg-muted">
								<BookOpenIcon class="h-4 w-4 text-muted-foreground" />
							</div>
						{/if}

						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<h3 class="font-medium">{book.title}</h3>
								{#if entry.position}
									<Badge variant="secondary" class="text-xs">{entry.position}</Badge>
								{/if}
								{#if book.firstPublishYear}
									<Badge variant="outline" class="text-xs">{book.firstPublishYear}</Badge>
								{/if}
							</div>

							{#if book.subtitle}
								<p class="truncate text-sm text-muted-foreground">{book.subtitle}</p>
							{/if}

							{#if book.authorText}
								<p class="text-xs text-muted-foreground">by {book.authorText}</p>
							{/if}
						</div>
					</a>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}

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
									<Avatar.Fallback class="text-xs">
										{author.displayName.charAt(0).toUpperCase()}
									</Avatar.Fallback>
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
