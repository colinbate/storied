<script lang="ts">
	import { pageTitle } from '$shared/brand';
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
	import UsersIcon from '@lucide/svelte/icons/users';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import { toast } from 'svelte-sonner';
	import MarkdownHint from '$lib/components/markdown-hint.svelte';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import { formatDate } from '$lib/date-format';
	import LibraryNav from '$lib/components/library-nav.svelte';
	import LibraryBreadcrumb from '$lib/components/library-breadcrumb.svelte';
	import ClassificationBadges from '$lib/components/classification-badges.svelte';

	let { data } = $props();
	const timeZone = $derived(data.user?.timezone);
	const externalSourceLabel = $derived(data.book.hardcoverUrl ? 'Hardcover' : 'Goodreads');
	const externalSourceUrl = $derived(data.book.hardcoverUrl ?? data.book.goodreadsUrl);

	const statusLabels: Record<string, string> = {
		want_to_read: 'Want to Read',
		reading: 'Reading',
		read: 'Read',
		did_not_finish: 'Did Not Finish'
	};
	const meetingRoleLabels: Record<string, string> = {
		starter: 'Suggested',
		featured: 'Featured',
		discussed: 'Discussed',
		mentioned_off_theme: 'Mentioned off theme'
	};
	const accessFormatLabels: Record<string, string> = {
		print: 'Print',
		ebook: 'Ebook',
		audiobook: 'Audiobook',
		other: 'Other format'
	};
	const accessProviderLabels: Record<string, string> = {
		library: 'Library',
		retailer: 'Retailer',
		subscription: 'Subscription',
		other: 'Other source'
	};

	const statusOptions = Object.entries(statusLabels);

	function statusLabel(status: string) {
		return statusLabels[status] ?? status;
	}

	function audiobookLength(minutes: number) {
		const hours = Math.floor(minutes / 60);
		const remainder = minutes % 60;
		return hours ? `${hours} hr${remainder ? ` ${remainder} min` : ''}` : `${remainder} min`;
	}

	function meetingStatusLabel(status: string) {
		return (
			{
				draft: 'Draft',
				scheduled: 'Upcoming',
				current: 'Current'
			}[status] ?? status
		);
	}
</script>

<svelte:head>
	<title>{pageTitle(data.book.title)}</title>
</svelte:head>

<div class="space-y-6">
	<LibraryNav />
	<LibraryBreadcrumb section="Books" sectionHref="/books" title={data.book.title} />

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
					<ClassificationBadges classifications={data.classifications} />
					{#if data.book.firstPublishYear}
						<Badge variant="outline">{data.book.firstPublishYear}</Badge>
					{/if}
					{#if data.book.isbn13}
						<Badge variant="outline">ISBN {data.book.isbn13}</Badge>
					{/if}
					{#if data.book.editionLabel}
						<Badge variant="outline">{data.book.editionLabel}</Badge>
					{/if}
					{#if data.book.language}
						<Badge variant="outline">{data.book.language}</Badge>
					{/if}
					{#if data.book.pageCount}
						<Badge variant="outline">{data.book.pageCount} pages</Badge>
					{/if}
					{#if data.book.audiobookMinutes}
						<Badge variant="outline">
							<ClockIcon class="h-3.5 w-3.5" />
							Audio {audiobookLength(data.book.audiobookMinutes)}
						</Badge>
					{/if}
					{#if externalSourceUrl}
						<a
							href={externalSourceUrl}
							target="_blank"
							rel="noopener noreferrer external"
							class="inline-flex items-center gap-1 text-sm text-primary hover:underline"
						>
							<ExternalLinkIcon class="h-3.5 w-3.5" />
							{externalSourceLabel}
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
							<NativeSelectOption value="" disabled selected={!data.myBookRelation}>
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
						<MarkdownHint />
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

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Club Meetings</Card.Title>
			<Card.Description>
				See when this book appeared in the club, or suggest it as a starter for an eligible meeting.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if data.sessionLinks.length > 0}
				<div class="divide-y rounded-lg border">
					{#each data.sessionLinks as item (item.session.id)}
						<a
							href={resolve('/sessions/[slug]', { slug: item.session.slug })}
							class="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="min-w-0">
								<p class="font-medium">{item.session.title}</p>
								<p class="text-sm text-muted-foreground">
									{formatDate(item.session.startsAt, {
										time: 'never',
										timeZone: item.session.timezone
									})}
									{#if item.themeName ?? item.session.themeTitle ?? item.session.theme}
										· {item.themeName ?? item.session.themeTitle ?? item.session.theme}
									{/if}
								</p>
								{#if item.link.note}
									<p class="mt-1 text-sm text-muted-foreground">{item.link.note}</p>
								{/if}
							</div>
							<Badge variant={item.link.status === 'featured' ? 'default' : 'secondary'}>
								{meetingRoleLabels[item.link.status] ?? item.link.status}
							</Badge>
						</a>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">This book has not been linked to a meeting yet.</p>
			{/if}

			{#if data.suggestionSessions.length > 0}
				<div class="space-y-3 border-t pt-4">
					<div>
						<h3 class="text-sm font-medium">Suggest as a starter book</h3>
						<p class="mt-1 text-sm text-muted-foreground">
							Adding this book makes it a starter book for the selected meeting. If that meeting is
							public, the starter book is also included on the public site.
						</p>
					</div>
					<form
						method="POST"
						action="?/suggestForSession"
						use:enhance={() => {
							return async ({ result, update }) => {
								await update();
								if (result.type === 'success') {
									toast.success('Book added as a starter for the meeting.');
								}
								if (result.type === 'failure') {
									toast.error(String(result.data?.error ?? 'Unable to suggest this book.'));
								}
							};
						}}
						class="flex flex-col gap-2 sm:flex-row sm:items-end"
					>
						<div class="min-w-0 flex-1 space-y-2">
							<label for="suggest-session" class="text-sm font-medium">Meeting</label>
							<NativeSelect id="suggest-session" name="sessionId" class="w-full" required>
								<NativeSelectOption value="" disabled selected>Choose a meeting</NativeSelectOption>
								{#each data.suggestionSessions as session (session.id)}
									<NativeSelectOption value={session.id}>
										{session.title} · {meetingStatusLabel(session.status)} · {formatDate(
											session.startsAt,
											{
												time: 'never',
												timeZone: session.timezone
											}
										)}
									</NativeSelectOption>
								{/each}
							</NativeSelect>
						</div>
						<Button type="submit" class="h-10">
							<CalendarIcon class="h-4 w-4" />
							Add Starter Book
						</Button>
					</form>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if data.accessOptions.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Where to Find It</Card.Title>
				<Card.Description>Availability maintained by the club.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-3 sm:grid-cols-2">
				{#each data.accessOptions as option (option.id)}
					<div class="rounded-lg border p-3">
						<div class="flex items-start gap-2">
							<LibraryIcon class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
							<div class="min-w-0 flex-1">
								{#if option.url}
									<a
										href={option.url}
										target="_blank"
										rel="noopener noreferrer external"
										class="font-medium hover:underline"
									>
										{option.providerName}
										<ExternalLinkIcon class="ml-1 inline h-3.5 w-3.5" />
									</a>
								{:else}
									<p class="font-medium">{option.providerName}</p>
								{/if}
								<div class="mt-1 flex flex-wrap gap-1.5">
									<Badge variant="secondary">{accessFormatLabels[option.format]}</Badge>
									<Badge variant="outline">{accessProviderLabels[option.providerType]}</Badge>
								</div>
								{#if option.note}<p class="mt-2 text-sm text-muted-foreground">
										{option.note}
									</p>{/if}
							</div>
						</div>
					</div>
				{/each}
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
								<div
									class="prose mt-2 max-w-none rounded-md bg-muted/40 p-3 text-sm dark:prose-invert"
								>
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html item.relation.noteHtml}
								</div>
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
