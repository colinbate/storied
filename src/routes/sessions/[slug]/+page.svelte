<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as NativeSelect from '$lib/components/ui/native-select';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import AuthorCard from '$lib/components/author-card.svelte';
	import BookCard from '$lib/components/BookCard.svelte';
	import SeriesCard from '$lib/components/series-card.svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import BellIcon from '@lucide/svelte/icons/bell';
	import BellOffIcon from '@lucide/svelte/icons/bell-off';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import XIcon from '@lucide/svelte/icons/x';
	import { formatDate } from '$lib/date-format';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	const timeZone = $derived(data.user?.timezone);
	let replyBody = $state('');
	let replying = $state(false);
	let rsvping = $state(false);

	function subjectCount(items: unknown[]) {
		return items.length === 1 ? '1 subject' : `${items.length} subjects`;
	}

	function readersFor(subjectType: string, subjectId: string) {
		return data.subjectReaders[`${subjectType}:${subjectId}`] ?? [];
	}

	const subjectGroups = $derived([
		{ title: 'Starter Books', items: data.starterSubjects },
		{ title: 'Featured', items: data.featuredSubjects },
		{ title: 'Discussed', items: data.discussedSubjects },
		{ title: 'Off-Theme Mentions', items: data.offThemeSubjects }
	]);

	const subscriptionModeLabels: Record<string, string> = {
		immediate: 'now notifying immediately',
		daily_digest: 'now in your daily digest',
		mute: 'muted',
		none: 'no longer watching'
	};

	const replyEnhance: SubmitFunction = () => {
		replying = true;
		return async ({ result, update }) => {
			replying = false;
			await update();
			if (result.type === 'success') {
				replyBody = '';
				toast.success('Reply posted.');
			} else if (result.type === 'failure' && result.data?.error) {
				toast.error(String(result.data.error));
			}
		};
	};

	const subscriptionModeEnhance: SubmitFunction = () => {
		return async ({ result, update }) => {
			await update();
			if (result.type === 'success') {
				const mode = result.data?.subscriptionMode;
				const label = typeof mode === 'string' ? subscriptionModeLabels[mode] : null;
				toast.success(label ? `Discussion ${label}.` : 'Notification preference updated.');
			} else if (result.type === 'failure' && result.data?.error) {
				toast.error(String(result.data.error));
			}
		};
	};

	const rsvpEnhance: SubmitFunction = () => {
		rsvping = true;
		return async ({ result, update }) => {
			rsvping = false;
			await update();
			if (result.type === 'success') {
				const status = result.data?.status;
				toast.success(status === 'declined' ? 'RSVP saved as declined.' : 'RSVP saved.');
			} else if (result.type === 'failure' && result.data?.error) {
				toast.error(String(result.data.error));
			}
		};
	};
</script>

<svelte:head>
	<title>{data.session.title} — The Archive</title>
</svelte:head>

<div class="space-y-8">
	<a
		href={resolve('/sessions')}
		class="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
	>
		<ArrowLeftIcon class="h-4 w-4" />
		Back to Sessions
	</a>

	<section class="space-y-4">
		<div class="flex flex-wrap items-center gap-2">
			<Badge variant={data.session.status === 'current' ? 'default' : 'secondary'}>
				{data.session.status}
			</Badge>
		</div>
		<div>
			<h1 class="text-3xl font-bold tracking-tight">{data.session.title}</h1>
			{#if data.session.themeTitle ?? data.session.theme}
				<p class="mt-2 text-xl text-muted-foreground">
					{data.session.themeTitle ?? data.session.theme}
				</p>
			{/if}
		</div>
		<div class="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
			<span class="inline-flex items-center gap-2">
				<CalendarIcon class="h-4 w-4" />
				{formatDate(data.session.startsAt, {
					time: 'always',
					timeZone,
					dateStyle: 'full'
				})}
			</span>
			{#if data.session.durationMinutes}
				<span class="inline-flex items-center gap-2">
					<ClockIcon class="h-4 w-4" />
					{data.session.durationMinutes} min
				</span>
			{/if}
			{#if data.session.locationName}
				<span class="inline-flex items-center gap-2">
					<MapPinIcon class="h-4 w-4" />
					{data.session.locationName}
				</span>
			{/if}
		</div>
		{#if data.session.themeSummary}
			<p class="max-w-3xl text-base leading-7">{data.session.themeSummary}</p>
		{/if}
		{#if data.canRsvp}
			<form
				method="POST"
				action="?/setRsvp"
				use:enhance={rsvpEnhance}
				class="flex flex-wrap items-center gap-2 rounded-lg border border-primary/50 px-3 py-2"
			>
				<span>RSVP:</span>
				<Button
					type="submit"
					name="status"
					value="registered"
					variant={data.currentUserRsvp?.attendanceStatus === 'attending' ? 'default' : 'outline'}
					disabled={rsvping}
				>
					<CheckIcon class="h-4 w-4" />
					I'll be there!
				</Button>
				<Button
					type="submit"
					name="status"
					value="declined"
					variant={data.currentUserRsvp?.attendanceStatus === 'not_attending'
						? 'default'
						: 'outline'}
					disabled={rsvping}
				>
					<XIcon class="h-4 w-4" />
					I can't make it
				</Button>
			</form>
		{/if}
	</section>

	{#if data.session.bodyHtml}
		<section class="prose max-w-none wrap-anywhere dark:prose-invert">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html data.session.bodyHtml}
		</section>
	{/if}

	<section class="grid gap-4 lg:grid-cols-2">
		{#each subjectGroups as group (group.title)}
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">{group.title}</Card.Title>
					<Card.Description>{subjectCount(group.items)}</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if group.items.length > 0}
						<div class="space-y-2">
							{#each group.items as item (item.link.subjectType + item.link.subjectId)}
								{#if item.kind === 'book'}
									<BookCard book={item.book} compact />
								{:else if item.kind === 'series'}
									<SeriesCard series={item.series} compact />
								{:else}
									<AuthorCard author={item.author} compact />
								{/if}
								{#if item.link.note}
									<p class="-mt-1 px-2 pb-2 text-xs text-muted-foreground">{item.link.note}</p>
								{/if}
								{@const readers = readersFor(item.link.subjectType, item.link.subjectId)}
								{#if readers.length > 0}
									<div class="flex flex-wrap gap-1 px-2 pb-2">
										{#each readers as { read, user } (user.id + read.subjectType + read.subjectId)}
											<Badge variant={read.isPrimaryPick ? 'default' : 'secondary'} class="text-xs">
												{user.displayName}{read.isPrimaryPick ? ' primary' : ''}
											</Badge>
										{/each}
									</div>
								{/if}
							{/each}
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">Nothing linked yet.</p>
					{/if}
				</Card.Content>
			</Card.Root>
		{/each}
	</section>

	{#if data.participants.length > 0}
		<section class="space-y-3">
			<h2 class="text-lg font-semibold">Participants</h2>
			<div class="flex flex-wrap gap-2">
				{#each data.participants as { participant, user } (user.id)}
					<div class="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
						<Avatar.Root class="h-7 w-7">
							{#if user.avatarUrl}
								<Avatar.Image src={user.avatarUrl} alt={user.displayName} />
							{/if}
							<Avatar.Fallback class="text-xs"
								>{user.displayName.charAt(0).toUpperCase()}</Avatar.Fallback
							>
						</Avatar.Root>
						<a href={resolve('/members/[id]', { id: user.id })} class="font-medium hover:underline">
							{user.displayName}
						</a>
						<Badge variant="secondary" class="text-xs">{participant.attendanceStatus}</Badge>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.primaryThread}
		<section class="space-y-4">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div class="space-y-1">
					<h2 class="text-lg font-semibold">Discussion</h2>
					<p class="text-sm text-muted-foreground">
						Questions, reactions, reading notes, and follow-up conversation for this session.
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-3">
					<form method="POST" action="?/setSubscriptionMode" use:enhance={subscriptionModeEnhance}>
						<label for="session-discussion-sub-mode" class="sr-only">Notify me</label>
						<div class="flex items-center gap-2">
							{#if data.primarySubscriptionMode === 'none' || data.primarySubscriptionMode === 'mute'}
								<BellOffIcon class="h-4 w-4 text-muted-foreground" />
							{:else}
								<BellIcon class="h-4 w-4 text-muted-foreground" />
							{/if}
							<NativeSelect.Root
								id="session-discussion-sub-mode"
								name="mode"
								value={data.primarySubscriptionMode}
								onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.requestSubmit()}
							>
								<NativeSelect.Option value="immediate">Notify me: Immediately</NativeSelect.Option>
								<NativeSelect.Option value="daily_digest"
									>Notify me: In my digest</NativeSelect.Option
								>
								<NativeSelect.Option value="mute">Notify me: Muted</NativeSelect.Option>
								<NativeSelect.Option value="none">Notify me: Off</NativeSelect.Option>
							</NativeSelect.Root>
						</div>
					</form>
					<Button
						variant="outline"
						class="h-10"
						href={resolve('/thread/[slug]', { slug: data.primaryThread.thread.slug })}
					>
						View full thread
					</Button>
				</div>
			</div>

			<Card.Root>
				<Card.Content class="space-y-5">
					<div class="flex gap-3">
						<Avatar.Root class="mt-0.5 h-10 w-10 shrink-0">
							{#if data.primaryThread.author.avatarUrl}
								<Avatar.Image
									src={data.primaryThread.author.avatarUrl}
									alt={data.primaryThread.author.displayName}
								/>
							{/if}
							<Avatar.Fallback>
								{data.primaryThread.author.displayName?.charAt(0).toUpperCase() ?? '?'}
							</Avatar.Fallback>
						</Avatar.Root>
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
								<span class="font-medium text-foreground"
									>{data.primaryThread.author.displayName}</span
								>
								<span>·</span>
								<span
									>{formatDate(data.primaryThread.thread.createdAt, {
										time: 'never',
										timeZone
									})}</span
								>
							</div>
							<div class="prose mt-3 max-w-none wrap-anywhere dark:prose-invert">
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html data.primaryThread.thread.bodyHtml}
							</div>
						</div>
					</div>

					{#if data.primaryPosts.length > 0}
						<div class="space-y-4 border-t pt-5">
							{#each data.primaryPosts as { post, author } (post.id)}
								<div class="flex gap-3">
									<Avatar.Root class="mt-0.5 h-9 w-9 shrink-0">
										{#if author.avatarUrl}
											<Avatar.Image src={author.avatarUrl} alt={author.displayName} />
										{/if}
										<Avatar.Fallback>{author.displayName.charAt(0).toUpperCase()}</Avatar.Fallback>
									</Avatar.Root>
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
											<span class="font-medium text-foreground">{author.displayName}</span>
											<span>·</span>
											<span>{formatDate(post.createdAt, { time: 'never', timeZone })}</span>
										</div>
										<div class="prose mt-2 max-w-none wrap-anywhere dark:prose-invert">
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											{@html post.bodyHtml}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}

					<form
						method="POST"
						action="?/reply"
						use:enhance={replyEnhance}
						class="space-y-3 border-t pt-5"
					>
						<Textarea
							name="body"
							rows={4}
							placeholder="Add your thoughts…"
							required
							bind:value={replyBody}
						/>
						<div class="flex justify-end">
							<Button type="submit" disabled={replying}>
								{replying ? 'Posting…' : 'Post Reply'}
							</Button>
						</div>
					</form>
				</Card.Content>
			</Card.Root>
		</section>
	{/if}

	{#if data.relatedThreads.length > 0}
		<section class="space-y-3">
			<h2 class="text-lg font-semibold">Related Conversations</h2>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each data.relatedThreads as { thread, author } (thread.id)}
					<a href={resolve('/thread/[slug]', { slug: thread.slug })} class="block">
						<Card.Root class="transition-colors hover:border-primary/40">
							<Card.Content class="py-4">
								<h3 class="font-medium">{thread.title}</h3>
								<p class="mt-1 text-sm text-muted-foreground">
									{author.displayName} · {thread.replyCount}
									{thread.replyCount === 1 ? 'reply' : 'replies'}
								</p>
							</Card.Content>
						</Card.Root>
					</a>
				{/each}
			</div>
		</section>
	{/if}
</div>
