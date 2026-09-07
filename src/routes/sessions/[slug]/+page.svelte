<script lang="ts">
	import SessionRsvp from '$lib/components/session-rsvp.svelte';
	import { pageTitle } from '$shared/brand';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import AuthorCard from '$lib/components/author-card.svelte';
	import BookCard from '$lib/components/BookCard.svelte';
	import SeriesCard from '$lib/components/series-card.svelte';
	import DiscussionThread from '$lib/components/discussion-thread.svelte';
	import MemberName from '$lib/components/member-name.svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import PlayIcon from '@lucide/svelte/icons/play';
	import NotebookPenIcon from '@lucide/svelte/icons/notebook-pen';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import XIcon from '@lucide/svelte/icons/x';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { formatDate } from '$lib/date-format';
	import { toast } from 'svelte-sonner';
	import SessionNav from '$lib/components/session-nav.svelte';
	import { SESSION_STATUS_LABELS } from '$shared/session-lifecycle';
	import { PRIMARY_ORIGIN } from '$shared/brand';
	import { createSessionCalendarLinks } from '$shared/session-calendar-links';
	import SessionReadingDialog from '$lib/components/session-reading-dialog.svelte';
	import ConfirmButton from '$lib/components/confirm-button.svelte';

	let { data, form } = $props();
	const timeZone = $derived(data.user?.timezone);
	let readingDialogOpen = $state(false);
	let editingChoiceId = $state<string | null>(null);
	let creatingDiscussion = $state(false);
	let suggesting = $state(false);
	let suggestOpen = $state(false);
	let suggestionTitle = $state('');

	const calendarLinks = $derived(
		createSessionCalendarLinks(data.session, {
			detailsUrl: new URL(`/sessions/${data.session.slug}`, PRIMARY_ORIGIN).toString(),
			icsUrl: resolve('/sessions/[slug]/calendar.ics', { slug: data.session.slug })
		})
	);
	const canManageSession = $derived(
		data.permissions.has('admin:view') && data.permissions.has('sessions:edit')
	);

	function subjectCount(items: unknown[]) {
		return items.length === 1 ? '1 subject' : `${items.length} subjects`;
	}

	const bookPickerItems = $derived(
		data.allBooks.map((book) => ({ id: book.id, title: book.title, authorText: book.authorText }))
	);
	const editingChoice = $derived(
		data.myReadingChoices.find((row) => row.choice.bookId === editingChoiceId) ?? null
	);
	const readingChoiceGroups = $derived.by(() => {
		type ReadingChoiceGroup = {
			subject: (typeof data.readingChoices)[number]['subject'];
			readers: typeof data.readingChoices;
		};
		const groups: ReadingChoiceGroup[] = [];
		for (const row of data.readingChoices) {
			const group = groups.find((entry) => entry.subject.id === row.choice.bookId);
			if (group) group.readers.push(row);
			else groups.push({ subject: row.subject, readers: [row] });
		}
		return groups;
	});
	const readingChoiceSummary = $derived.by(() => {
		const readers = new Set(data.readingChoices.map((row) => row.attendee.id)).size;
		const books = readingChoiceGroups.length;
		return `${readers} ${readers === 1 ? 'reader' : 'readers'} · ${books} ${books === 1 ? 'book' : 'books'}`;
	});

	const readingStatusLabels: Record<string, string> = {
		considering: 'Considering',
		planned: 'Planning to read',
		reading: 'Reading',
		finished: 'Finished',
		did_not_finish: 'Did not finish'
	};

	const subjectGroups = $derived(
		[
			{ title: 'Starter Books', items: data.starterSubjects },
			{ title: 'Featured', items: data.featuredSubjects },
			{ title: 'Discussed', items: data.discussedSubjects },
			{ title: 'Off-Theme Mentions', items: data.offThemeSubjects }
		].filter((group) => group.items.length > 0)
	);

	const rsvpParticipants = $derived(
		data.participants.map((person) => ({
			id: person.attendeeId,
			userId: person.userId,
			displayName: person.name,
			avatarUrl: person.avatarUrl,
			attendanceStatus: person.status
		}))
	);

	function openReadingDialog(bookId: string | null = null) {
		editingChoiceId = bookId;
		readingDialogOpen = true;
	}

	const removeReadingChoice: SubmitFunction = () => {
		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success' && result.data?.readingChoiceRemoved) {
				toast.success('Reading choice removed.');
			} else if (result.type === 'failure' && result.data?.readingChoiceError) {
				toast.error(String(result.data.readingChoiceError));
			}
		};
	};

	const readyAgenda = $derived(data.agenda.filter((item) => item.status !== 'pending'));
	const mySuggestions = $derived(
		data.agenda.filter(
			(item) => item.status === 'pending' && item.submittedByUserId === data.user?.id
		)
	);
	const agendaOpen = $derived(
		data.phase === 'prepare' &&
			data.session.status !== 'cancelled' &&
			data.session.status !== 'draft'
	);

	const suggestEnhance: SubmitFunction = () => {
		suggesting = true;
		return async ({ result, update }) => {
			suggesting = false;
			await update({ reset: false });
			if (result.type === 'success' && result.data?.agendaSuggested) {
				toast.success('Suggestion sent to the host.');
				suggestionTitle = '';
				suggestOpen = false;
			} else if (result.type === 'failure' && result.data?.agendaError) {
				toast.error(String(result.data.agendaError));
			}
		};
	};

	const withdrawEnhance: SubmitFunction = () => {
		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') toast.success('Suggestion withdrawn.');
		};
	};

	const createDiscussionEnhance: SubmitFunction = () => {
		creatingDiscussion = true;
		return async ({ result, update }) => {
			creatingDiscussion = false;
			await update();
			if (result.type === 'success') {
				toast.success('Discussion created.');
			} else if (result.type === 'failure' && result.data?.error) {
				toast.error(String(result.data.error));
			}
		};
	};
</script>

<svelte:head>
	<title>{pageTitle(data.session.title)}</title>
</svelte:head>

<div class="space-y-8">
	<SessionNav />

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
				{SESSION_STATUS_LABELS[data.session.status]}
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
	</section>

	<!-- Meeting overview -->
	<div class="min-w-0 space-y-8">
		<div class="space-y-4">
			<div class="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
				<span class="inline-flex items-center gap-2">
					<CalendarIcon class="h-4 w-4" />
					{formatDate(data.session.startsAt, {
						time: 'always',
						timeZone: data.session.timezone ?? timeZone,
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
			{#if canManageSession || data.canFacilitate}
				<div class="flex flex-wrap gap-2">
					{#if data.canFacilitate && data.session.status !== 'cancelled'}
						<Button
							variant={data.phase === 'run' ? 'default' : 'outline'}
							href={resolve('/sessions/[slug]/run', { slug: data.session.slug })}
						>
							<PlayIcon class="h-4 w-4" />
							{data.phase === 'run'
								? 'Session in progress'
								: data.phase === 'recap'
									? 'Attendance and notes'
									: 'Prepare and Run'}
						</Button>
						<Button
							variant="outline"
							href={resolve('/sessions/[slug]/recap', { slug: data.session.slug })}
						>
							<NotebookPenIcon class="h-4 w-4" />
							Recap
						</Button>
					{/if}
					{#if canManageSession}
						<Button
							variant="outline"
							href={resolve('/admin/sessions/[slug]', { slug: data.session.slug })}
						>
							Manage Session
						</Button>
					{/if}
				</div>
			{/if}
			{#if data.discussion}
				<a class={buttonVariants({ variant: 'outline' })} href="#discussion">
					<MessageSquareIcon class="h-4 w-4" />
					Jump to Discussion
				</a>
			{/if}
			<SessionRsvp
				action="?/setRsvp"
				sessionSlug={data.session.slug}
				sessionStatus={data.session.status}
				status={data.currentUserRsvp?.attendanceStatus ?? null}
				canRsvp={data.canRsvp}
				canDecline={data.canDeclineRsvp}
				capacity={data.session.rsvpCapacity}
				attendingCount={data.attendingCount}
				waitlistEnabled={data.session.rsvpWaitlistEnabled}
				{calendarLinks}
				participants={rsvpParticipants}
			/>
			{#if data.canGiveFeedback}
				<p class="text-sm text-muted-foreground">
					<SparklesIcon class="mr-1 inline h-3.5 w-3.5" />
					{#if data.hasOwnFeedback}
						Thanks for your feedback on this session.
					{:else if data.viewerAttended}
						You were there.
					{:else}
						Were you there?
					{/if}
					<a
						href={resolve('/sessions/[slug]/feedback', { slug: data.session.slug })}
						class="text-primary hover:underline"
					>
						{data.hasOwnFeedback ? 'Edit your private feedback' : 'Give the host private feedback'}
					</a>
				</p>
			{/if}
		</div>

		{#if data.session.bodyHtml}
			<section class="prose max-w-none wrap-anywhere dark:prose-invert">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html data.session.bodyHtml}
			</section>
		{/if}

		{#if readyAgenda.length > 0 || mySuggestions.length > 0 || agendaOpen}
			<Card.Root>
				<Card.Header>
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="space-y-1.5">
							<Card.Title class="flex items-center gap-2 text-base">
								<ClipboardListIcon class="h-4 w-4" /> Agenda
							</Card.Title>
							<Card.Description>
								{readyAgenda.length === 0
									? 'The host has not set an agenda yet.'
									: data.phase === 'recap'
										? 'What we covered at the meeting.'
										: data.phase === 'run'
											? 'What we are covering at the meeting.'
											: 'What we plan to cover at the meeting.'}
							</Card.Description>
						</div>
						{#if data.pendingSuggestionCount > 0}
							<a
								href={resolve('/sessions/[slug]/run', { slug: data.session.slug })}
								class="text-sm text-primary hover:underline"
							>
								{data.pendingSuggestionCount}
								{data.pendingSuggestionCount === 1 ? 'suggestion' : 'suggestions'} to review
							</a>
						{/if}
						{#if agendaOpen && !suggestOpen}
							<Button size="sm" variant="outline" onclick={() => (suggestOpen = true)}>
								<PlusIcon class="h-4 w-4" />
								Suggest an item
							</Button>
						{/if}
					</div>
				</Card.Header>
				<Card.Content class="space-y-4">
					{#if readyAgenda.length > 0}
						<ol class="space-y-2">
							{#each readyAgenda as item (item.id)}
								<li class="flex gap-3 text-sm">
									<span
										class="mt-0.5 h-5 w-5 shrink-0 rounded-full border text-center text-xs leading-[1.15rem] text-muted-foreground"
									>
										{#if item.status === 'completed'}✓{:else if item.status === 'skipped'}–{/if}
									</span>
									<span
										class={item.status === 'skipped' ? 'text-muted-foreground line-through' : ''}
									>
										<span class="font-medium">{item.title}</span>
										{#if item.description}
											<span class="block text-muted-foreground">{item.description}</span>
										{/if}
									</span>
								</li>
							{/each}
						</ol>
					{/if}
					{#if mySuggestions.length > 0}
						<div class="space-y-2 rounded-lg border border-dashed p-3 text-sm">
							<p class="text-xs font-medium text-muted-foreground uppercase">
								Your suggestions awaiting review
							</p>
							{#each mySuggestions as item (item.id)}
								<div class="flex items-start justify-between gap-3">
									<span>{item.title}</span>
									<form
										method="POST"
										action="?/withdrawAgendaSuggestion"
										use:enhance={withdrawEnhance}
									>
										<input type="hidden" name="itemId" value={item.id} />
										<Button
											type="submit"
											variant="ghost"
											size="icon-sm"
											aria-label="Withdraw suggestion"
										>
											<XIcon class="h-3.5 w-3.5" />
										</Button>
									</form>
								</div>
							{/each}
						</div>
					{/if}
					{#if agendaOpen && suggestOpen}
						<form
							method="POST"
							action="?/suggestAgendaItem"
							use:enhance={suggestEnhance}
							class="space-y-3 rounded-lg border p-3"
						>
							<div class="space-y-1">
								<Label for="agenda-suggestion">Topic or question for the meeting</Label>
								<Input
									id="agenda-suggestion"
									name="title"
									bind:value={suggestionTitle}
									maxlength={200}
									required
									placeholder="Should we try shorter themes?"
								/>
							</div>
							<p class="text-xs text-muted-foreground">
								The host reviews suggestions before they appear on the agenda. This is separate from
								the discussion thread below.
							</p>
							<div class="flex justify-end gap-2">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onclick={() => (suggestOpen = false)}>Cancel</Button
								>
								<Button
									type="submit"
									size="sm"
									disabled={suggesting || suggestionTitle.trim().length < 3}
								>
									{suggesting ? 'Sending…' : 'Submit suggestion'}
								</Button>
							</div>
						</form>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}

		<section class="space-y-4">
			<Card.Root>
				<Card.Header>
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="space-y-1.5">
							<Card.Title class="text-base">Reading Choices</Card.Title>
							<Card.Description>
								{#if readingChoiceGroups.length > 0}
									{readingChoiceSummary}
								{:else}
									What members are reading for this session.
								{/if}
							</Card.Description>
						</div>
						<Button size="sm" onclick={() => openReadingDialog()}>
							<PlusIcon class="h-4 w-4" />
							Add Mine
						</Button>
					</div>
				</Card.Header>
				<Card.Content>
					{#if readingChoiceGroups.length > 0}
						<div class="grid gap-4 md:grid-cols-2">
							{#each readingChoiceGroups as group (group.subject.id)}
								<div class="min-w-0 space-y-1">
									<BookCard book={group.subject} compact />
									<ul class="space-y-1 px-2">
										{#each group.readers as { choice, attendee } (attendee.id)}
											<li class="flex items-center gap-2 text-sm">
												<span class="min-w-0 flex-1 truncate">
													{#if attendee.userId}
														<MemberName userId={attendee.userId} name={attendee.name} />
													{:else}
														{attendee.name}
													{/if}
													<span class="text-xs text-muted-foreground">
														· {readingStatusLabels[choice.readingStatus ?? ''] ??
															'Status not recorded'}
													</span>
												</span>
												{#if attendee.userId === data.user?.id}
													<span class="flex shrink-0 gap-1">
														<Button
															variant="ghost"
															size="icon-sm"
															onclick={() => openReadingDialog(choice.bookId)}
															aria-label={`Edit ${group.subject.title}`}
														>
															<PencilIcon class="h-3.5 w-3.5" />
														</Button>
														<ConfirmButton
															confirmText="Remove this reading choice?"
															formAction="?/removeReadingChoice"
															formData={{ bookId: choice.bookId }}
															enhance={removeReadingChoice}
															variant="ghost"
															size="icon-sm"
															title={`Remove ${group.subject.title}`}
														>
															<Trash2Icon class="h-3.5 w-3.5" />
														</ConfirmButton>
													</span>
												{/if}
											</li>
										{/each}
									</ul>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">No reading choices yet.</p>
					{/if}
				</Card.Content>
			</Card.Root>

			{#each subjectGroups as group (group.title)}
				<Card.Root>
					<Card.Header>
						<Card.Title class="text-base">{group.title}</Card.Title>
						<Card.Description>{subjectCount(group.items)}</Card.Description>
					</Card.Header>
					<Card.Content>
						<div class="grid gap-2 md:grid-cols-2">
							{#each group.items as item (item.link.subjectType + item.link.subjectId)}
								<div class="min-w-0">
									{#if item.kind === 'book'}
										<BookCard book={item.book} compact />
									{:else if item.kind === 'series'}
										<SeriesCard series={item.series} compact />
									{:else}
										<AuthorCard author={item.author} compact />
									{/if}
									{#if item.link.note}
										<p class="-mt-1 px-2 pb-2 text-xs text-muted-foreground">
											{item.link.note}
										</p>
									{/if}
								</div>
							{/each}
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</section>

		{#if data.session.memberRecapHtml}
			<Card.Root class="border-primary/30">
				<Card.Header>
					<Card.Title class="flex items-center gap-2 text-base">
						<NotebookPenIcon class="h-4 w-4" /> Recap
					</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="prose max-w-none wrap-anywhere dark:prose-invert">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html data.session.memberRecapHtml}
					</div>
				</Card.Content>
			</Card.Root>
		{/if}
	</div>

	<!-- The full discussion thread, same component as the standalone thread page. -->
	<section id="discussion" class="scroll-mt-28 border-t pt-8">
		{#if data.discussion}
			<DiscussionThread view={data.discussion} viewer={data.user} {form} variant="embedded" />
		{:else}
			<Card.Root>
				<Card.Content class="space-y-3 py-10 text-center text-muted-foreground">
					<MessageSquareIcon class="mx-auto h-6 w-6 opacity-60" />
					<p>This session does not have a discussion thread yet.</p>
					{#if data.canCreateDiscussion}
						<form method="POST" action="?/createDiscussion" use:enhance={createDiscussionEnhance}>
							<Button type="submit" variant="outline" disabled={creatingDiscussion}>
								{creatingDiscussion ? 'Creating…' : 'Create Discussion Thread'}
							</Button>
						</form>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}
	</section>

	<section class="space-y-3">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-lg font-semibold">Related Conversations</h2>
			<!-- eslint-disable svelte/no-navigation-without-resolve -- resolved route with a query string -->
			<a
				class={buttonVariants({ variant: 'outline', size: 'sm' })}
				href={`${resolve('/new')}?session=${encodeURIComponent(data.session.slug)}`}
			>
				<PlusIcon class="h-4 w-4" />
				Start a Conversation
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</div>
		{#if data.relatedThreads.length > 0}
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
		{:else}
			<p class="text-sm text-muted-foreground">
				Side conversations linked to this session will appear here.
			</p>
		{/if}
	</section>

	{#if readingDialogOpen}
		{#key editingChoiceId ?? 'new-reading'}
			<SessionReadingDialog
				bind:open={readingDialogOpen}
				books={bookPickerItems}
				choice={editingChoice
					? {
							bookId: editingChoice.choice.bookId,
							readingStatus: editingChoice.choice.readingStatus
						}
					: null}
			/>
		{/key}
	{/if}
</div>
