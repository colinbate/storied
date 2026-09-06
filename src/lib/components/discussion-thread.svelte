<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onDestroy, tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as NativeSelect from '$lib/components/ui/native-select';
	import * as Popover from '$lib/components/ui/popover';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import PostComposer from '$lib/components/post-composer.svelte';
	import MarkdownHint from '$lib/components/markdown-hint.svelte';
	import PostImage from '$lib/components/post-image.svelte';
	import AuthorCard from '$lib/components/author-card.svelte';
	import BookCard from '$lib/components/BookCard.svelte';
	import SeriesCard from '$lib/components/series-card.svelte';
	import ConfirmButton from '$lib/components/confirm-button.svelte';
	import MemberName from '$lib/components/member-name.svelte';
	import BellIcon from '@lucide/svelte/icons/bell';
	import BellOffIcon from '@lucide/svelte/icons/bell-off';
	import PinIcon from '@lucide/svelte/icons/pin';
	import PinOffIcon from '@lucide/svelte/icons/pin-off';
	import LockIcon from '@lucide/svelte/icons/lock';
	import UnlockIcon from '@lucide/svelte/icons/lock-open';
	import ReplyIcon from '@lucide/svelte/icons/reply';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import XIcon from '@lucide/svelte/icons/x';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import UserIcon from '@lucide/svelte/icons/user';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { formatDate } from '$lib/date-format';
	import { loadReplyDraft, removeReplyDraft, saveReplyDraft } from '$lib/reply-drafts';
	import { publicPostImageUrl } from '$lib/post-images';
	import { cn } from '$lib/utils.js';
	import type { SubjectSourceType } from '$shared/worker-messages';
	import type { ThreadViewData } from '$lib/server/thread-view';
	import { spoilerSafeExcerpt } from '$shared/spoilers';
	import type { ResolvedPathname } from '$app/types';

	type QueuedSubjectLink = {
		sourceType: Extract<
			SubjectSourceType,
			| 'goodreads'
			| 'goodreads-series'
			| 'goodreads-author'
			| 'hardcover'
			| 'hardcover-series'
			| 'hardcover-author'
		>;
		sourceKey: string;
		subjectKind: 'book' | 'series' | 'author';
	};

	type MentionKind = 'book' | 'series' | 'author';
	type Mention = {
		kind: MentionKind;
		id: string;
		title: string;
		subtitle: string | null;
		imageUrl: string | null;
		href: ResolvedPathname;
		sessionSubject: { status: string } | null;
	};

	let {
		view,
		viewer,
		form = null,
		variant = 'page'
	}: {
		view: ThreadViewData;
		viewer: { id: string; timezone?: string | null } | null;
		form?: { error?: string | null } | null;
		/** `page` renders the thread title as the page heading; `embedded` renders it as a section. */
		variant?: 'page' | 'embedded';
	} = $props();

	function isQueuedSubjectSourceType(value: unknown): value is QueuedSubjectLink['sourceType'] {
		return (
			value === 'goodreads' ||
			value === 'goodreads-series' ||
			value === 'goodreads-author' ||
			value === 'hardcover' ||
			value === 'hardcover-series' ||
			value === 'hardcover-author'
		);
	}

	let replyBody = $state('');
	let loading = $state(false);
	let replyingTo = $state<string | null>(null);
	let replyTextarea = $state<HTMLTextAreaElement | null>(null);
	let replyImageFiles = $state<FileList | undefined>();
	let replyContainsSpoilers = $state(false);
	let activeReplyDraftId = $state<string | null>(null);
	let queuedSubjectLinks = $state<QueuedSubjectLink[]>([]);
	let queuedSubjectPollTimer: ReturnType<typeof setTimeout> | null = null;
	let queuedSubjectPollStartedAt = 0;

	/** Post id currently being edited (empty string = editing the thread opener) */
	let editingId = $state<string | null>(null);
	let editBody = $state('');
	let editContainsSpoilers = $state(false);
	let editSaving = $state(false);

	const currentUserId = $derived(viewer?.id ?? null);
	const timeZone = $derived(viewer?.timezone ?? undefined);
	const embedded = $derived(variant === 'embedded');
	const editWindowMs = $derived(view.postEditWindowMs);
	const postsById = $derived(new Map(view.posts.map((entry) => [entry.post.id, entry])));
	const replyingToPost = $derived(replyingTo ? postsById.get(replyingTo) : null);
	const subjectsDependency = $derived(`app:thread-subjects:${view.thread.id}`);
	const replyDraftComposerId = $derived(`thread:${view.thread.id}`);
	const threadImageUrl = $derived(publicPostImageUrl(view.fileBaseUrl, view.thread.imageKey));
	const canPromote = $derived(Boolean(view.session) && view.canPromoteBooks);
	const showSessionLink = $derived(
		view.canModerate && view.canManageSessions && view.thread.sessionThreadRole !== 'primary'
	);

	const mentionGroups = $derived.by(() => {
		const groups: { heading: string; kind: MentionKind; items: Mention[] }[] = [
			{
				heading: 'Authors Mentioned',
				kind: 'author',
				items: view.authors.map(({ author, sessionSubject }) => ({
					kind: 'author' as const,
					id: author.id,
					title: author.name,
					subtitle: null,
					imageUrl: author.photoUrl ?? null,
					href: resolve('/authors/[slug]', { slug: author.slug }),
					sessionSubject
				}))
			},
			{
				heading: 'Series Mentioned',
				kind: 'series',
				items: view.series.map(({ series, sessionSubject }) => ({
					kind: 'series' as const,
					id: series.id,
					title: series.title,
					subtitle: series.authorText ?? null,
					imageUrl: series.coverUrl ?? null,
					href: resolve('/series/[slug]', { slug: series.slug }),
					sessionSubject
				}))
			},
			{
				heading: 'Books Mentioned',
				kind: 'book',
				items: view.books.map(({ book, sessionSubject }) => ({
					kind: 'book' as const,
					id: book.id,
					title: book.title,
					subtitle: book.authorText ?? null,
					imageUrl: book.coverUrl ?? null,
					href: resolve('/books/[slug]', { slug: book.slug }),
					sessionSubject
				}))
			}
		];
		return groups.filter((group) => group.items.length > 0);
	});
	const showAside = $derived(mentionGroups.length > 0 || queuedSubjectLinks.length > 0);

	$effect(() => {
		if (!currentUserId) return;

		const nextDraftId = `${currentUserId}:${replyDraftComposerId}`;
		if (activeReplyDraftId !== nextDraftId) {
			const draft = loadReplyDraft(currentUserId, replyDraftComposerId);
			replyBody = draft?.body ?? '';
			replyContainsSpoilers = draft?.containsSpoilers ?? false;
			replyingTo =
				draft?.parentPostId && postsById.has(draft.parentPostId) ? draft.parentPostId : null;
			activeReplyDraftId = nextDraftId;
			return;
		}

		saveReplyDraft(currentUserId, replyDraftComposerId, {
			body: replyBody,
			parentPostId: replyingTo,
			containsSpoilers: replyContainsSpoilers
		});
	});

	function canEdit(authorId: string, createdAt: string): boolean {
		if (!currentUserId || currentUserId !== authorId) return false;
		const created = Date.parse(createdAt);
		if (Number.isNaN(created)) return false;
		return Date.now() - created < editWindowMs;
	}

	function startEditThread() {
		editingId = '';
		editBody = view.thread.bodySource;
		editContainsSpoilers = view.thread.containsSpoilers;
	}

	function startEditPost(postId: string, bodySource: string, containsSpoilers: boolean) {
		editingId = postId;
		editBody = bodySource;
		editContainsSpoilers = containsSpoilers;
	}

	function cancelEdit() {
		editingId = null;
		editBody = '';
		editContainsSpoilers = false;
	}

	function getPostPreview(body: string, containsSpoilers: boolean) {
		return spoilerSafeExcerpt(body, { containsSpoilers }) ?? '';
	}

	async function selectReplyTarget(postId: string) {
		replyingTo = replyingTo === postId ? null : postId;
		if (!replyingTo) return;

		await tick();
		document.getElementById('reply-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		replyTextarea?.focus({ preventScroll: true });
	}

	function getInitial(name: string) {
		return name.charAt(0).toUpperCase();
	}

	function addQueuedSubjectLinks(value: QueuedSubjectLink[] | null | undefined) {
		if (!Array.isArray(value)) return;

		const next = [...queuedSubjectLinks];
		const seenKeys = next.map((link) => `${link.sourceType}:${link.sourceKey}`);

		for (const link of value) {
			if (
				typeof link !== 'object' ||
				link === null ||
				!isQueuedSubjectSourceType(link.sourceType) ||
				(link.subjectKind !== 'book' &&
					link.subjectKind !== 'series' &&
					link.subjectKind !== 'author') ||
				typeof link.sourceKey !== 'string'
			) {
				continue;
			}

			const key = `${link.sourceType}:${link.sourceKey}`;
			if (seenKeys.includes(key)) continue;
			seenKeys.push(key);
			next.push({
				sourceType: link.sourceType,
				sourceKey: link.sourceKey,
				subjectKind: link.subjectKind
			});
		}

		queuedSubjectLinks = next;
		startQueuedSubjectPolling();
	}

	function stopQueuedSubjectPolling() {
		if (!queuedSubjectPollTimer) return;
		clearTimeout(queuedSubjectPollTimer);
		queuedSubjectPollTimer = null;
	}

	function getQueuedSubjectStatusUrl() {
		const params = queuedSubjectLinks
			.map((link) => `source=${encodeURIComponent(`${link.sourceType}:${link.sourceKey}`)}`)
			.join('&');

		return `${resolve('/thread/[slug]/subject-status', { slug: view.thread.slug })}?${params}`;
	}

	async function pollQueuedSubjectLinks() {
		if (queuedSubjectLinks.length === 0) {
			stopQueuedSubjectPolling();
			return;
		}

		if (Date.now() - queuedSubjectPollStartedAt > 60_000) {
			queuedSubjectLinks = [];
			stopQueuedSubjectPolling();
			return;
		}

		try {
			const response = await fetch(getQueuedSubjectStatusUrl());
			if (response.ok) {
				const payload = (await response.json()) as {
					sources?: Array<{
						sourceType?: string;
						sourceKey?: string;
						status?: 'pending' | 'resolved' | 'failed' | 'unknown';
					}>;
				};

				const finishedKeys = (payload.sources ?? [])
					.filter((source) => source.status === 'resolved' || source.status === 'failed')
					.map((source) => `${source.sourceType}:${source.sourceKey}`);
				const hadResolved = (payload.sources ?? []).some((source) => source.status === 'resolved');

				if (finishedKeys.length > 0) {
					queuedSubjectLinks = queuedSubjectLinks.filter(
						(link) => !finishedKeys.includes(`${link.sourceType}:${link.sourceKey}`)
					);
				}

				if (hadResolved) {
					await invalidate(subjectsDependency);
				}
			}
		} finally {
			if (queuedSubjectLinks.length > 0) {
				queuedSubjectPollTimer = setTimeout(pollQueuedSubjectLinks, 2_500);
			} else {
				stopQueuedSubjectPolling();
			}
		}
	}

	function startQueuedSubjectPolling() {
		if (queuedSubjectLinks.length === 0 || queuedSubjectPollTimer) return;
		queuedSubjectPollStartedAt = Date.now();
		queuedSubjectPollTimer = setTimeout(pollQueuedSubjectLinks, 2_500);
	}

	onDestroy(stopQueuedSubjectPolling);

	const replyEnhance: SubmitFunction = () => {
		loading = true;
		return async ({ result, update }) => {
			loading = false;
			await update();
			if (result.type === 'success') {
				const queued =
					typeof result.data === 'object' && result.data !== null
						? (result.data as { queuedSubjectLinks?: QueuedSubjectLink[] }).queuedSubjectLinks
						: null;
				addQueuedSubjectLinks(queued);
				if (currentUserId) {
					removeReplyDraft(currentUserId, replyDraftComposerId);
				}
				replyBody = '';
				replyImageFiles = undefined;
				replyContainsSpoilers = false;
				replyingTo = null;
				toast.success(
					Array.isArray(queued) && queued.length > 0
						? 'Reply posted. Book links are being processed.'
						: 'Reply posted.'
				);
			} else if (result.type === 'failure' && result.data?.error) {
				toast.error(String(result.data.error));
			}
		};
	};

	const editEnhance: SubmitFunction = () => {
		editSaving = true;
		return async ({ result, update }) => {
			editSaving = false;
			await update({ reset: false });
			if (result.type === 'success' && result.data?.edited) {
				toast.success('Updated.');
				editingId = null;
				editBody = '';
				editContainsSpoilers = false;
			} else if (result.type === 'failure' && result.data?.error) {
				toast.error(String(result.data.error));
			}
		};
	};

	const feedbackEnhance: (msg: string) => SubmitFunction = (msg) => () => {
		return async ({ result, update }) => {
			await update();
			if (result.type === 'success') {
				toast.success(msg);
			} else if (result.type === 'failure' && result.data?.error) {
				toast.error(String(result.data.error));
			}
		};
	};

	const subscriptionModeLabels: Record<string, string> = {
		immediate: 'now notifying immediately',
		daily_digest: 'now in your daily digest',
		mute: 'muted',
		none: 'no longer watching'
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
</script>

{#snippet mentionCard(entry: Mention)}
	{#if canPromote}
		<Popover.Root>
			<Popover.Trigger class="w-full rounded-lg text-left transition-colors hover:bg-muted">
				<span class="flex items-start gap-3 p-2">
					{#if entry.imageUrl}
						<img
							src={entry.imageUrl}
							alt={entry.title}
							class={cn(
								'h-16 shrink-0 rounded object-cover shadow-sm',
								entry.kind === 'author' ? 'w-16' : 'w-11'
							)}
						/>
					{:else}
						<span
							class={cn(
								'flex h-16 shrink-0 items-center justify-center rounded bg-muted',
								entry.kind === 'author' ? 'w-16' : 'w-11'
							)}
						>
							{#if entry.kind === 'series'}
								<LibraryIcon class="h-5 w-5 text-muted-foreground" />
							{:else if entry.kind === 'author'}
								<UserIcon class="h-5 w-5 text-muted-foreground" />
							{:else}
								<BookOpenIcon class="h-5 w-5 text-muted-foreground" />
							{/if}
						</span>
					{/if}
					<span class="min-w-0 flex-1">
						<span class="block text-sm leading-tight font-medium">{entry.title}</span>
						{#if entry.subtitle}
							<span class="mt-0.5 block text-xs text-muted-foreground">{entry.subtitle}</span>
						{/if}
						{#if entry.sessionSubject}
							<Badge variant="secondary" class="mt-1 px-1.5 py-0 text-[10px]">
								{entry.sessionSubject.status.replaceAll('_', ' ')}
							</Badge>
						{/if}
					</span>
				</span>
			</Popover.Trigger>
			<Popover.Content align="start" class="w-72 space-y-3">
				<div>
					<p class="font-medium">{entry.title}</p>
					<p class="text-sm text-muted-foreground">
						{entry.sessionSubject
							? 'Linked to this session.'
							: 'Promote this mention to the session.'}
					</p>
				</div>
				<form
					method="POST"
					action="?/promoteSessionSubject"
					use:enhance={feedbackEnhance('Session link updated.')}
					class="space-y-2"
				>
					<input type="hidden" name="subjectType" value={entry.kind} />
					<input type="hidden" name="subjectId" value={entry.id} />
					<label for="{entry.kind}-status-{entry.id}" class="text-xs font-medium">
						Session status
					</label>
					<NativeSelect.Root
						id="{entry.kind}-status-{entry.id}"
						name="status"
						value={entry.sessionSubject?.status ?? 'starter'}
					>
						<NativeSelect.Option value="starter">starter</NativeSelect.Option>
						<NativeSelect.Option value="featured">featured</NativeSelect.Option>
						<NativeSelect.Option value="discussed">discussed</NativeSelect.Option>
						<NativeSelect.Option value="mentioned_off_theme"
							>mentioned off theme</NativeSelect.Option
						>
					</NativeSelect.Root>
					<Button type="submit" size="sm" class="w-full">
						{entry.sessionSubject ? 'Update Status' : 'Link to Session'}
					</Button>
				</form>
				<div class="flex gap-2">
					<Button variant="outline" size="sm" href={entry.href} class="flex-1">
						<ExternalLinkIcon class="h-4 w-4" />
						Open
					</Button>
					{#if entry.sessionSubject}
						<form
							method="POST"
							action="?/unlinkSessionSubject"
							use:enhance={feedbackEnhance('Removed from session.')}
							class="flex-1"
						>
							<input type="hidden" name="subjectType" value={entry.kind} />
							<input type="hidden" name="subjectId" value={entry.id} />
							<Button type="submit" variant="outline" size="sm" class="w-full">Unlink</Button>
						</form>
					{/if}
				</div>
			</Popover.Content>
		</Popover.Root>
	{:else if entry.kind === 'author'}
		{@const match = view.authors.find(({ author }) => author.id === entry.id)}
		{#if match}<AuthorCard author={match.author} compact />{/if}
	{:else if entry.kind === 'series'}
		{@const match = view.series.find(({ series }) => series.id === entry.id)}
		{#if match}<SeriesCard series={match.series} compact />{/if}
	{:else}
		{@const match = view.books.find(({ book }) => book.id === entry.id)}
		{#if match}<BookCard book={match.book} compact />{/if}
	{/if}
{/snippet}

{#snippet editForm(action: string, postId: string | null, rows: number)}
	<form method="POST" {action} use:enhance={editEnhance} class="space-y-2">
		{#if postId}
			<input type="hidden" name="postId" value={postId} />
		{/if}
		<Textarea name="body" {rows} bind:value={editBody} required />
		<MarkdownHint />
		<label class="flex items-center gap-2 text-sm text-muted-foreground">
			<input
				type="checkbox"
				name="containsSpoilers"
				class="rounded border-input"
				bind:checked={editContainsSpoilers}
			/>
			This entire {postId ? 'reply' : 'post'} contains spoilers
		</label>
		<div class="flex justify-end gap-2">
			<Button type="button" variant="ghost" size="sm" onclick={cancelEdit} disabled={editSaving}>
				<XIcon class="h-4 w-4" />
				Cancel
			</Button>
			<Button type="submit" size="sm" disabled={editSaving || !editBody.trim()}>
				{editSaving ? 'Saving…' : 'Save'}
			</Button>
		</div>
	</form>
{/snippet}

<div class="flex flex-col gap-6 lg:flex-row">
	<div class="@container min-w-0 flex-1 space-y-6">
		<!-- Heading, meta, subscription, moderation -->
		<div class="flex flex-col items-start justify-between gap-4 @3xl:flex-row">
			<div class="min-w-0">
				<div class="flex items-center gap-2">
					{#if embedded}
						<h2 class="text-lg font-semibold">Discussion</h2>
					{:else}
						<h1 class="text-2xl font-bold">{view.thread.title}</h1>
					{/if}
					{#if view.thread.isPinned}
						<PinIcon class="h-4 w-4 text-primary" />
					{/if}
					{#if view.thread.isLocked}
						<LockIcon class="h-4 w-4 text-muted-foreground" />
					{/if}
				</div>
				<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<MemberName userId={view.author.id} name={view.author.displayName} />
					<span>·</span>
					<span>{formatDate(view.thread.createdAt, { time: 'never', timeZone })}</span>
					{#if view.thread.replyCount > 0}
						<span>·</span>
						<span>
							{view.thread.replyCount}
							{view.thread.replyCount === 1 ? 'reply' : 'replies'}
						</span>
					{/if}
					{#if view.audienceGroup}
						<span>·</span>
						<Badge variant="outline" class="gap-1 px-2 py-0 text-xs">
							<UsersIcon class="h-3 w-3" />
							{view.audienceGroup.name}
						</Badge>
					{/if}
					{#if view.session && !embedded}
						<span>·</span>
						<a href={resolve('/sessions/[slug]', { slug: view.session.slug })}>
							<Badge variant="secondary" class="gap-1 px-2 py-0 text-xs hover:bg-secondary/80">
								<CalendarIcon class="h-3 w-3" />
								{view.session.title}
							</Badge>
						</a>
						{#if view.thread.sessionThreadRole === 'primary'}
							<Badge variant="outline" class="px-2 py-0 text-xs">main discussion</Badge>
						{/if}
					{/if}
				</div>
			</div>

			<div class="flex flex-row gap-2">
				<form method="POST" action="?/setSubscriptionMode" use:enhance={subscriptionModeEnhance}>
					<label for="thread-sub-mode-{view.thread.id}" class="sr-only">Notify me</label>
					<div class="flex items-center gap-2">
						{#if view.subscriptionMode === 'none' || view.subscriptionMode === 'mute'}
							<BellOffIcon class="h-4 w-4 text-muted-foreground" />
						{:else}
							<BellIcon class="h-4 w-4 text-muted-foreground" />
						{/if}
						<NativeSelect.Root
							id="thread-sub-mode-{view.thread.id}"
							name="mode"
							value={view.subscriptionMode}
							onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.requestSubmit()}
						>
							<NativeSelect.Option value="immediate">Notify me: Immediately</NativeSelect.Option>
							<NativeSelect.Option value="daily_digest">Notify me: In my digest</NativeSelect.Option
							>
							<NativeSelect.Option value="mute">Notify me: Muted</NativeSelect.Option>
							<NativeSelect.Option value="none">Notify me: Off</NativeSelect.Option>
						</NativeSelect.Root>
					</div>
				</form>

				{#if view.canModerate}
					<Popover.Root>
						<Popover.Trigger
							class={buttonVariants({ variant: 'outline', class: 'h-10' })}
							aria-label="Moderator tools"
						>
							<ShieldIcon class="size-4" />
						</Popover.Trigger>
						<Popover.Content align="end" class="w-min space-y-3">
							<div class="flex items-center gap-2 font-medium">
								<ShieldIcon class="h-4 w-4" />
								<span>Moderator Tools</span>
							</div>
							<div class="flex gap-2">
								<form
									method="POST"
									action="?/togglePin"
									use:enhance={feedbackEnhance(view.thread.isPinned ? 'Unpinned.' : 'Pinned.')}
								>
									<Button variant="outline" size="sm" type="submit">
										{#if view.thread.isPinned}
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
									use:enhance={feedbackEnhance(view.thread.isLocked ? 'Unlocked.' : 'Locked.')}
								>
									<Button variant="outline" size="sm" type="submit">
										{#if view.thread.isLocked}
											<UnlockIcon class="h-4 w-4" />
											Unlock
										{:else}
											<LockIcon class="h-4 w-4" />
											Lock
										{/if}
									</Button>
								</form>
								<div class="ml-auto">
									<ConfirmButton
										confirmText="Delete this thread?"
										formAction="?/deleteThread"
										variant="outline"
										size="sm"
										class="text-destructive hover:text-destructive"
									>
										<TrashIcon class="h-4 w-4" />
										Delete Thread
									</ConfirmButton>
								</div>
							</div>
							{#if showSessionLink}
								<form
									method="POST"
									action="?/linkSession"
									use:enhance={feedbackEnhance('Session link updated.')}
									class="flex items-center gap-2"
								>
									<label
										for="session-select-{view.thread.id}"
										class="flex items-center gap-1 text-muted-foreground"
									>
										<CalendarIcon class="h-4 w-4" />
										Session
									</label>
									<NativeSelect.Root
										id="session-select-{view.thread.id}"
										name="sessionId"
										onchange={(e) => e.currentTarget.form?.requestSubmit()}
									>
										<NativeSelect.Option value="" selected={!view.thread.sessionId}>
											No session
										</NativeSelect.Option>
										{#each view.allSessions as session (session.id)}
											<NativeSelect.Option
												value={session.id}
												selected={view.thread.sessionId === session.id}
											>
												{session.title}
											</NativeSelect.Option>
										{/each}
									</NativeSelect.Root>
								</form>
								{#if view.thread.sessionId}
									<p class="text-sm text-muted-foreground">
										Manually linked session threads are treated as related conversations.
									</p>
								{/if}
							{/if}
							{#if view.canManageGroups}
								<form
									method="POST"
									action="?/setAudienceGroup"
									use:enhance={feedbackEnhance('Thread audience updated.')}
									class="flex items-center gap-2"
								>
									<label
										for="audience-select-{view.thread.id}"
										class="flex items-center gap-1 text-muted-foreground"
									>
										<UsersIcon class="h-4 w-4" />
										Audience
									</label>
									<NativeSelect.Root
										id="audience-select-{view.thread.id}"
										name="audienceGroupId"
										onchange={(e) => e.currentTarget.form?.requestSubmit()}
									>
										<NativeSelect.Option value="" selected={!view.thread.audienceGroupId}>
											All members
										</NativeSelect.Option>
										{#each view.allAudienceGroups as group (group.id)}
											<NativeSelect.Option
												value={group.id}
												selected={view.thread.audienceGroupId === group.id}
											>
												{group.name}{group.archivedAt ? ' (archived)' : ''}
											</NativeSelect.Option>
										{/each}
									</NativeSelect.Root>
								</form>
							{/if}
						</Popover.Content>
					</Popover.Root>
				{/if}
			</div>
		</div>

		{#if view.session && !embedded}
			<Card.Root class="border-primary/30 bg-primary/20">
				<Card.Content class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-medium">Part of {view.session.title}</span>
							{#if view.thread.sessionThreadRole === 'primary'}
								<Badge variant="secondary">Main discussion thread</Badge>
							{:else}
								<Badge variant="outline">Related thread</Badge>
							{/if}
						</div>
						<div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
							{#if view.session.startsAt}
								<span class="inline-flex items-center gap-1">
									<CalendarIcon class="h-3.5 w-3.5" />
									{formatDate(view.session.startsAt, {
										time: 'never',
										timeZone: view.session.timezone ?? timeZone
									})}
								</span>
							{/if}
							{#if view.session.locationName}
								<span class="inline-flex items-center gap-1">
									<MapPinIcon class="h-3.5 w-3.5" />
									{view.session.locationName}
								</span>
							{/if}
							{#if view.session.themeTitle ?? view.session.theme}
								<span>{view.session.themeTitle ?? view.session.theme}</span>
							{/if}
						</div>
					</div>
					<Button variant="outline" href={resolve('/sessions/[slug]', { slug: view.session.slug })}>
						View Session
					</Button>
				</Card.Content>
			</Card.Root>
		{/if}

		<!-- Opening post -->
		<Card.Root>
			<Card.Content class="pt-1">
				<div class="flex items-start gap-3">
					<Avatar.Root class="h-10 w-10 shrink-0">
						{#if view.author.avatarUrl}
							<Avatar.Image src={view.author.avatarUrl} alt={view.author.displayName} />
						{/if}
						<Avatar.Fallback>{getInitial(view.author.displayName)}</Avatar.Fallback>
					</Avatar.Root>
					<div class="min-w-0 flex-1">
						<div class="mb-2 flex items-center gap-2">
							<a
								href={resolve('/members/[id]', { id: view.author.id })}
								class="font-medium hover:underline"
							>
								<MemberName userId={view.author.id} name={view.author.displayName} />
							</a>
							<span class="text-xs text-muted-foreground">
								{formatDate(view.thread.createdAt, { time: 'always', timeZone })}
							</span>
							{#if editingId !== '' && canEdit(view.author.id, view.thread.createdAt)}
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
							{@render editForm('?/editThread', null, 6)}
						{:else if view.thread.containsSpoilers}
							<details class="spoiler-whole">
								<summary>Show post with spoilers</summary>
								<div class="spoiler-whole-content">
									{#if threadImageUrl}
										<div class="mb-4">
											<PostImage
												src={threadImageUrl}
												alt="Image attached by {view.author.displayName}"
											/>
										</div>
									{/if}
									<div class="prose max-w-none wrap-anywhere dark:prose-invert">
										<!-- eslint-disable-next-line svelte/no-at-html-tags -->
										{@html view.thread.bodyHtml}
									</div>
								</div>
							</details>
						{:else}
							{#if threadImageUrl}
								<div class="mb-4">
									<PostImage
										src={threadImageUrl}
										alt="Image attached by {view.author.displayName}"
									/>
								</div>
							{/if}
							<div class="prose max-w-none wrap-anywhere dark:prose-invert">
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html view.thread.bodyHtml}
							</div>
						{/if}
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<!-- Replies -->
		{#if view.posts.length > 0}
			<Separator />
			<h3 class="text-lg font-semibold">
				{view.posts.length}
				{view.posts.length === 1 ? 'Reply' : 'Replies'}
			</h3>

			<div class="space-y-3">
				{#each view.posts as { post, author } (post.id)}
					{@const postImageUrl = publicPostImageUrl(view.fileBaseUrl, post.imageKey)}
					<Card.Root
						id="post-{post.id}"
						class={cn(
							'scroll-mt-20 target:border-2 target:border-primary',
							replyingTo === post.id && 'border-2 border-primary bg-primary/5'
						)}
					>
						<Card.Content class="pt-1">
							<div class="flex items-start gap-3">
								<Avatar.Root class="h-8 w-8 shrink-0">
									{#if author.avatarUrl}
										<Avatar.Image src={author.avatarUrl} alt={author.displayName} />
									{/if}
									<Avatar.Fallback class="text-xs">{getInitial(author.displayName)}</Avatar.Fallback
									>
								</Avatar.Root>
								<div class="min-w-0 flex-1">
									<div class="mb-2 flex flex-wrap items-center gap-2">
										<a
											href={resolve('/members/[id]', { id: author.id })}
											class="text-sm font-medium hover:underline"
										>
											<MemberName userId={author.id} name={author.displayName} />
										</a>
										<span class="text-xs text-muted-foreground">
											{formatDate(post.createdAt, { time: 'always', timeZone })}
										</span>
										{#if post.editCount > 0}
											<span class="text-xs text-muted-foreground italic">(edited)</span>
										{/if}
										{#if post.parentPostId}
											{@const parentPost = postsById.get(post.parentPostId)}
											<a
												href="#post-{post.parentPostId}"
												class="inline-flex max-w-full min-w-0 items-center gap-1 text-xs text-primary hover:underline"
											>
												<ReplyIcon class="h-3 w-3 shrink-0" />
												{#if parentPost}
													<span class="shrink-0">in reply to {parentPost.author.displayName}</span>
													<span class="shrink-0 text-muted-foreground">·</span>
													<span class="line-clamp-1 min-w-0 text-muted-foreground">
														{getPostPreview(
															parentPost.post.bodySource,
															parentPost.post.containsSpoilers
														)}
													</span>
												{:else}
													<span>in reply</span>
												{/if}
											</a>
										{/if}
									</div>
									{#if editingId === post.id}
										{@render editForm('?/editPost', post.id, 4)}
									{:else if post.containsSpoilers}
										<details class="spoiler-whole">
											<summary>Show reply with spoilers</summary>
											<div class="spoiler-whole-content">
												{#if postImageUrl}
													<div class="mb-4">
														<PostImage
															src={postImageUrl}
															alt="Image attached by {author.displayName}"
														/>
													</div>
												{/if}
												<div class="prose max-w-none wrap-anywhere dark:prose-invert">
													<!-- eslint-disable-next-line svelte/no-at-html-tags -->
													{@html post.bodyHtml}
												</div>
											</div>
										</details>
									{:else}
										{#if postImageUrl}
											<div class="mb-4">
												<PostImage
													src={postImageUrl}
													alt="Image attached by {author.displayName}"
												/>
											</div>
										{/if}
										<div class="prose max-w-none wrap-anywhere dark:prose-invert">
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											{@html post.bodyHtml}
										</div>
									{/if}
									{#if editingId !== post.id}
										<div class="mt-2 flex flex-wrap items-center gap-3">
											{#if !view.thread.isLocked}
												<button
													type="button"
													class="text-xs text-muted-foreground transition-colors hover:text-foreground"
													onclick={() => selectReplyTarget(post.id)}
												>
													<ReplyIcon class="mr-1 inline h-3 w-3" />
													Reply
												</button>
											{/if}
											{#if canEdit(author.id, post.createdAt)}
												<button
													type="button"
													class="text-xs text-muted-foreground transition-colors hover:text-foreground"
													onclick={() =>
														startEditPost(post.id, post.bodySource, post.containsSpoilers)}
												>
													<PencilIcon class="mr-1 inline h-3 w-3" />
													Edit
												</button>
											{/if}
											{#if view.canModerate}
												<ConfirmButton
													confirmText="Delete this post?"
													formAction="?/deletePost"
													formData={{ postId: post.id }}
													enhance={feedbackEnhance('Post deleted.')}
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

		<!-- Reply form or locked notice -->
		{#if !view.thread.isLocked}
			<Separator />
			<Card.Root id="reply-form" class="scroll-mt-20">
				<Card.Header>
					<Card.Title class="flex flex-wrap items-center gap-3 text-base">
						{#if replyingTo}
							Reply to {replyingToPost?.author.displayName ?? 'post'}
							<Button size="sm" variant="outline" onclick={() => (replyingTo = null)}>Cancel</Button
							>
						{:else}
							Post a Reply
						{/if}
					</Card.Title>
				</Card.Header>
				<Card.Content>
					<form
						method="POST"
						action="?/reply"
						enctype="multipart/form-data"
						use:enhance={replyEnhance}
						class="space-y-3"
					>
						{#if replyingTo}
							<input type="hidden" name="parentPostId" value={replyingTo} />
						{/if}
						<PostComposer
							id="thread-reply-{view.thread.id}"
							bind:ref={replyTextarea}
							placeholder="Write your reply… (Markdown supported)"
							rows={4}
							bind:value={replyBody}
							bind:files={replyImageFiles}
							required
						/>
						<p class="text-xs text-muted-foreground">
							Hardcover and Goodreads book, series, and author URLs are linked to the thread after
							posting.
						</p>
						<label class="flex items-center gap-2 text-sm text-muted-foreground">
							<input
								type="checkbox"
								name="containsSpoilers"
								class="rounded border-input"
								bind:checked={replyContainsSpoilers}
							/>
							This entire reply contains spoilers
						</label>
						{#if form?.error}
							<p class="text-sm text-destructive">{form.error}</p>
						{/if}
						<div class="flex justify-end">
							<Button type="submit" disabled={loading || !replyBody.trim()}>
								{#if loading}
									Posting…
								{:else if view.session}
									<CalendarIcon class="size-4" /> Post Session Reply
								{:else}
									Post Reply
								{/if}
							</Button>
						</div>
					</form>
				</Card.Content>
			</Card.Root>
		{:else}
			<Card.Root>
				<Card.Content class="py-8 text-center text-muted-foreground">
					<LockIcon class="mx-auto mb-2 h-5 w-5" />
					<p>This discussion is locked. No new replies can be posted.</p>
				</Card.Content>
			</Card.Root>
		{/if}
	</div>

	{#if showAside}
		<aside class="w-full shrink-0 lg:w-64">
			<div class="space-y-6">
				{#if queuedSubjectLinks.length > 0}
					<div>
						<h3 class="mb-3 text-sm font-semibold text-muted-foreground">Processing</h3>
						<div class="space-y-2">
							{#each queuedSubjectLinks as link (`${link.sourceType}:${link.sourceKey}`)}
								<div class="flex items-start gap-3 rounded-lg border border-dashed p-2">
									<span
										class="flex h-16 w-11 shrink-0 animate-pulse items-center justify-center rounded bg-muted"
									>
										{#if link.subjectKind === 'series'}
											<LibraryIcon class="h-5 w-5 text-muted-foreground" />
										{:else if link.subjectKind === 'author'}
											<UserIcon class="h-5 w-5 text-muted-foreground" />
										{:else}
											<BookOpenIcon class="h-5 w-5 text-muted-foreground" />
										{/if}
									</span>
									<div class="min-w-0 flex-1 space-y-2 pt-0.5">
										<div class="flex items-center gap-1.5 text-sm leading-tight font-medium">
											<LoaderCircleIcon class="h-3.5 w-3.5 animate-spin text-muted-foreground" />
											<span>
												{link.subjectKind === 'series'
													? 'Series'
													: link.subjectKind === 'author'
														? 'Author'
														: 'Book'} loading
											</span>
										</div>
										<p class="text-xs text-muted-foreground">
											Book URL is being processed. It should appear here shortly.
										</p>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
				{#each mentionGroups as group (group.kind)}
					<div>
						<h3 class="mb-3 text-sm font-semibold text-muted-foreground">{group.heading}</h3>
						<div class="space-y-2">
							{#each group.items as entry (entry.id)}
								{@render mentionCard(entry)}
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</aside>
	{/if}
</div>
