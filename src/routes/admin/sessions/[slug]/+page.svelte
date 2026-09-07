<script lang="ts">
	import { pageTitle } from '$shared/brand';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import AuthorPicker from '$lib/components/admin/author-picker.svelte';
	import BookPicker from '$lib/components/admin/book-picker.svelte';
	import SeriesPicker from '$lib/components/admin/series-picker.svelte';
	import SessionThemePicker from '$lib/components/admin/session-theme-picker.svelte';
	import ConfirmButton from '$lib/components/confirm-button.svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import LinkIcon from '@lucide/svelte/icons/link';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import UserIcon from '@lucide/svelte/icons/user';
	import UsersIcon from '@lucide/svelte/icons/users';
	import MailIcon from '@lucide/svelte/icons/mail';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import PlayIcon from '@lucide/svelte/icons/play';
	import { toast } from 'svelte-sonner';
	import MarkdownHint from '$lib/components/markdown-hint.svelte';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import type { SessionDetailChange } from '$shared/session-messages';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import { SESSION_STATUSES, SESSION_STATUS_LABELS } from '$shared/session-lifecycle';
	import { supportedTimeZones } from '$lib/timezone-options';

	let { data, form } = $props();
	let saving = $state(false);
	let savingStatus = $state(false);
	let detailChangePrompt = $state<{
		changes: SessionDetailChange[];
		previous: { startsAt: string | null; timezone: string; locationName: string | null };
	} | null>(null);
	let cancellationPrompt = $state(false);
	const messagesHref = $derived(
		resolve('/admin/sessions/[slug]/messages', { slug: data.session.slug })
	);
	const detailUpdateHref = $derived.by(() => {
		if (!detailChangePrompt) return messagesHref;
		const { previous } = detailChangePrompt;
		const query = [
			['template', 'update'],
			['prevStartsAt', previous.startsAt ?? ''],
			['prevTimezone', previous.timezone],
			['prevLocation', previous.locationName ?? '']
		]
			.filter(([, value]) => value !== '' || true)
			.map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
			.join('&');
		return `${messagesHref}?${query}`;
	});
	let selectedThemeId = $derived(data.session.themeId ?? '');
	let sessionTimezone = $derived(data.session.timezone ?? 'Atlantic/Bermuda');
	const allTimezones = $derived(
		supportedTimeZones(data.session.timezone, sessionTimezone, data.user?.timezone)
	);

	type LinkKind = 'book' | 'series' | 'author';
	type SubjectStatus = 'starter' | 'featured' | 'discussed' | 'mentioned_off_theme';
	let addKind = $state<LinkKind>('book');
	let addBookId = $state<string | undefined>(undefined);
	let addSeriesId = $state<string | undefined>(undefined);
	let addAuthorId = $state<string | undefined>(undefined);
	let addStatus = $state<SubjectStatus>('starter');
	let showLinkForms = $state(false);
	let showAddReadingChoice = $state(false);
	let readReaderId = $state('');
	let readBookId = $state<string | undefined>(undefined);
	let readBookUrl = $state<string | null>(null);

	let starterUrls = $state('');
	let featuredUrls = $state('');
	let discussedUrls = $state('');
	let mentionedOffThemeUrls = $state('');
	const batchUrlCount = $derived(
		[starterUrls, featuredUrls, discussedUrls, mentionedOffThemeUrls].reduce(
			(count, value) => count + value.split(/\r?\n/).filter((line) => line.trim()).length,
			0
		)
	);

	const bookPickerItems = $derived(
		data.allBooks
			.filter((b) => !b.deletedAt)
			.filter((b) => !data.linkedSubjects.some((s) => s.kind === 'book' && s.book.id === b.id))
			.map((b) => ({ id: b.id, title: b.title, authorText: b.authorText }))
	);
	const seriesPickerItems = $derived(
		data.allSeries
			.filter((s) => !s.deletedAt)
			.filter(
				(s) => !data.linkedSubjects.some((ls) => ls.kind === 'series' && ls.series.id === s.id)
			)
			.map((s) => ({ id: s.id, title: s.title, authorText: s.authorText }))
	);
	const authorPickerItems = $derived(
		data.allAuthors
			.filter((a) => !a.deletedAt)
			.filter(
				(a) => !data.linkedSubjects.some((ls) => ls.kind === 'author' && ls.author.id === a.id)
			)
			.map((a) => ({ id: a.id, name: a.name }))
	);
	const availableThemes = $derived(
		data.themes
			.filter((theme) => theme.status !== 'archived' || theme.id === data.session.themeId)
			.map((theme) => ({ id: theme.id, name: theme.name, status: theme.status }))
	);

	const books = $derived(data.linkedSubjects.filter((l) => l.kind === 'book'));
	const seriesLinks = $derived(data.linkedSubjects.filter((l) => l.kind === 'series'));
	const authorLinks = $derived(data.linkedSubjects.filter((l) => l.kind === 'author'));
	const readingBookPickerItems = $derived(
		data.allBooks
			.filter((book) => !book.deletedAt)
			.map((book) => ({ id: book.id, title: book.title, authorText: book.authorText }))
	);

	function linkedBookStatus(bookId: string) {
		return data.linkedSubjects.find((entry) => entry.kind === 'book' && entry.book.id === bookId)
			?.link.status;
	}

	const addSubjectSelected = $derived(
		addKind === 'book' ? !!addBookId : addKind === 'series' ? !!addSeriesId : !!addAuthorId
	);
</script>

<svelte:head>
	<title>{pageTitle(`${data.session.title} — Session Admin`)}</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-center gap-2">
		<Button variant="ghost" size="icon-sm" href={resolve('/admin/sessions')}>
			<ArrowLeftIcon class="h-4 w-4" />
		</Button>
		<h1 class="text-2xl font-bold">{data.session.title}</h1>
		<Badge variant={data.session.status === 'current' ? 'default' : 'secondary'}>
			{SESSION_STATUS_LABELS[data.session.status]}
		</Badge>
		{#if data.session.themeTitle ?? data.session.theme}
			<Badge variant="secondary">{data.session.themeTitle ?? data.session.theme}</Badge>
		{/if}
	</div>

	<nav class="flex flex-wrap gap-2" aria-label="Session management">
		<a class={buttonVariants({ variant: 'outline' })} href="#details">Details</a>
		<Button
			variant="outline"
			href={resolve('/admin/sessions/[slug]/attendees', { slug: data.session.slug })}
		>
			<UsersIcon class="h-4 w-4" /> People
		</Button>
		<a class={buttonVariants({ variant: 'outline' })} href="#reading">
			<BookOpenIcon class="h-4 w-4" /> Reading
		</a>
		<Button variant="outline" href={resolve('/sessions/[slug]/run', { slug: data.session.slug })}>
			<PlayIcon class="h-4 w-4" /> Agenda and Run
		</Button>
		<Button variant="outline" href={messagesHref}>
			<MailIcon class="h-4 w-4" /> Message Attendees
		</Button>
		<Button variant="outline" href={resolve('/sessions/[slug]/recap', { slug: data.session.slug })}>
			<ClipboardListIcon class="h-4 w-4" /> Recap
		</Button>
		<Button variant="ghost" href={resolve('/sessions/[slug]', { slug: data.session.slug })}>
			<EyeIcon class="h-4 w-4" /> Member View
		</Button>
	</nav>

	{#if form?.error}
		<div class="rounded border border-destructive p-3 text-destructive">
			{form.error}
		</div>
	{/if}

	{#if detailChangePrompt}
		<Card.Root class="border-primary/40 bg-primary/5">
			<Card.Content class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div class="space-y-1 text-sm">
					<p class="font-medium">Details changed. Let attendees know?</p>
					<ul class="text-muted-foreground">
						{#each detailChangePrompt.changes as change (change.field)}
							<li>
								{change.label}: {change.to} <span class="opacity-70">(was {change.from})</span>
							</li>
						{/each}
					</ul>
				</div>
				<div class="flex shrink-0 gap-2">
					<!-- eslint-disable svelte/no-navigation-without-resolve -- resolved route with a query string -->
					<a class={buttonVariants()} href={detailUpdateHref}>
						<MailIcon class="h-4 w-4" />
						Send Update
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
					<Button variant="ghost" onclick={() => (detailChangePrompt = null)}>Not now</Button>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if cancellationPrompt}
		<Card.Root class="border-destructive/40 bg-destructive/5">
			<Card.Content class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div class="space-y-1 text-sm">
					<p class="font-medium">Session cancelled. Tell the people who replied?</p>
					<p class="text-muted-foreground">
						A prepared cancellation notice goes to confirmed, waitlisted, and maybe responses.
					</p>
				</div>
				<div class="flex shrink-0 gap-2">
					<!-- eslint-disable svelte/no-navigation-without-resolve -- resolved route with a query string -->
					<a class={buttonVariants()} href="{messagesHref}?template=cancelled">
						<MailIcon class="h-4 w-4" />
						Send Notice
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
					<Button variant="ghost" onclick={() => (cancellationPrompt = false)}>Not now</Button>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root id="details" class="scroll-mt-24">
		<Card.Header>
			<Card.Title class="text-base">Session Status</Card.Title>
			<Card.Description>
				Drafts stay private. Upcoming sessions are visible to members. Current also appears on Home.
				Save the required details before publishing; cancelling closes RSVPs and prepares an
				attendee notice.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/updateStatus"
				use:enhance={() => {
					savingStatus = true;
					return async ({ result, update }) => {
						savingStatus = false;
						await update({ reset: false });
						if (result.type === 'success' && result.data?.statusUpdated) {
							toast.success('Session status updated.');
							cancellationPrompt = Boolean(result.data.cancelled);
						}
					};
				}}
				class="flex flex-wrap items-end gap-3"
			>
				<input type="hidden" name="expectedUpdatedAt" value={data.session.updatedAt} />
				<div class="min-w-48 space-y-2">
					<Label for="status">Status</Label>
					<NativeSelect id="status" name="status" value={data.session.status}>
						{#each SESSION_STATUSES as status (status)}<NativeSelectOption value={status}
								>{SESSION_STATUS_LABELS[status]}</NativeSelectOption
							>{/each}
					</NativeSelect>
				</div>
				<Button type="submit" class="h-10" disabled={savingStatus}>
					{savingStatus ? 'Updating…' : 'Update Status'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Session metadata -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Session Details</Card.Title>
			<Card.Description>Slug: <span class="font-mono">{data.session.slug}</span></Card.Description>
		</Card.Header>
		{#key data.session.id}
			<Card.Content>
				<form
					method="POST"
					action="?/updateSession"
					use:enhance={() => {
						saving = true;
						return async ({ result, update }) => {
							saving = false;
							await update({ reset: false });
							if (result.type === 'success') {
								if (result.data?.updated) toast.success('Session updated.');
								if (result.data?.error) toast.error(String(result.data.error));
								const changes = (result.data?.detailChanges ?? []) as SessionDetailChange[];
								const previous = result.data?.previousDetails as
									| { startsAt: string | null; timezone: string; locationName: string | null }
									| null
									| undefined;
								detailChangePrompt = changes.length > 0 && previous ? { changes, previous } : null;
							}
						};
					}}
					class="space-y-4"
				>
					<input type="hidden" name="expectedUpdatedAt" value={data.session.updatedAt} />
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="title">Title</Label>
							<Input id="title" name="title" value={data.session.title} required />
						</div>
						<div class="space-y-2">
							<Label for="slug">Slug</Label>
							<Input id="slug" disabled name="slug" value={data.session.slug} required />
						</div>
						<div class="space-y-2">
							<Label for="startsAt">Starts At</Label>
							<Input
								id="startsAt"
								name="startsAt"
								type="datetime-local"
								value={data.session.startsAt ?? ''}
							/>
						</div>
						<div class="space-y-2">
							<Label for="timezone">Timezone</Label>
							<NativeSelect id="timezone" name="timezone" bind:value={sessionTimezone}>
								{#each allTimezones as tz (tz)}
									<NativeSelectOption value={tz}>{tz}</NativeSelectOption>
								{/each}
							</NativeSelect>
						</div>
						<div class="space-y-2">
							<Label for="durationMinutes">Duration Minutes</Label>
							<Input
								id="durationMinutes"
								name="durationMinutes"
								type="number"
								min="0"
								value={data.session.durationMinutes ?? ''}
							/>
						</div>
						<div class="space-y-2">
							<Label for="locationName">Location</Label>
							<Input
								id="locationName"
								name="locationName"
								value={data.session.locationName ?? ''}
							/>
						</div>
						<div class="sm:col-span-2">
							<SessionThemePicker
								themes={availableThemes}
								bind:selectedId={selectedThemeId}
								label={data.session.status === 'current' || data.session.status === 'past'
									? 'Theme'
									: 'Theme (can be decided later)'}
								required={data.session.status === 'current' || data.session.status === 'past'}
							/>
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="themeSummary">Theme Summary</Label>
							<Textarea
								id="themeSummary"
								name="themeSummary"
								rows={2}
								value={data.session.themeSummary ?? ''}
							/>
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="bodySource">Session description</Label>
							<Textarea
								id="bodySource"
								name="bodySource"
								rows={8}
								value={data.session.bodySource ?? ''}
							/>
							<MarkdownHint />
						</div>
						<div class="space-y-2">
							<Label for="rsvpCapacity">RSVP Capacity</Label>
							<Input
								id="rsvpCapacity"
								name="rsvpCapacity"
								type="number"
								min="1"
								value={data.session.rsvpCapacity}
							/>
						</div>
						<label class="flex items-center gap-2 text-sm"
							><input
								name="rsvpEnabled"
								type="checkbox"
								class="rounded border-input"
								checked={data.session.rsvpEnabled}
							/>Accept RSVPs once published, until the session starts</label
						>
						<label class="flex items-center gap-2 text-sm">
							<input
								name="rsvpWaitlistEnabled"
								type="checkbox"
								checked={data.session.rsvpWaitlistEnabled}
								class="rounded border-input"
							/>
							Enable RSVP waitlist
						</label>
						<details class="space-y-4 rounded-lg border p-4 sm:col-span-2">
							<summary class="cursor-pointer font-medium">Advanced and public-site fields</summary>
							<p class="text-sm text-muted-foreground">
								Integration settings for RSVP and supporting-site links.
							</p>
							<div class="grid gap-4 sm:grid-cols-2">
								<div class="space-y-2">
									<Label for="rsvpSlug">RSVP Slug</Label>
									<Input id="rsvpSlug" name="rsvpSlug" value={data.session.rsvpSlug ?? ''} />
								</div>
								<div class="space-y-2">
									<Label for="astroPath">Public Site Path</Label>
									<Input id="astroPath" name="astroPath" value={data.session.astroPath ?? ''} />
								</div>
								<div class="space-y-2 sm:col-span-2">
									<Label for="externalUrl">External Session URL</Label>
									<Input
										id="externalUrl"
										name="externalUrl"
										type="url"
										value={data.session.externalUrl ?? ''}
									/>
								</div>
								<label class="flex items-center gap-2 text-sm sm:col-span-2">
									<input
										name="isPublic"
										type="checkbox"
										checked={data.session.isPublic}
										class="rounded border-input"
									/>
									Show on the public site when published
								</label>
							</div>
						</details>
					</div>
					<Button type="submit" disabled={saving}>
						{saving ? 'Saving…' : 'Save Session'}
					</Button>
				</form>
			</Card.Content>
		{/key}
	</Card.Root>

	<!-- Reading choices -->
	<Card.Root id="reading" class="scroll-mt-24">
		<Card.Header>
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="space-y-1.5">
					<Card.Title class="text-base"
						>Session Reading Choices ({data.readingChoices.length})</Card.Title
					>
					<Card.Description>
						Record what a member or guest considered or read. Reading choices do not change their
						attendance.
					</Card.Description>
				</div>
				{#if !showAddReadingChoice}
					<Button
						size="sm"
						variant="outline"
						onclick={() => (showAddReadingChoice = true)}
						aria-expanded="false"
						aria-controls="add-reading-choice"
					>
						<PlusIcon class="h-4 w-4" /> Add Reading Choice
					</Button>
				{/if}
			</div>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if data.readingChoices.length > 0}
				<div class="divide-y rounded-md border">
					{#each data.readingChoices as { choice, attendee, book } (attendee.id + choice.bookId)}
						<div class="flex flex-wrap items-center gap-3 px-4 py-3">
							<form
								method="POST"
								action="?/upsertReadingChoice"
								use:enhance={() => {
									saving = true;
									return async ({ result, update }) => {
										saving = false;
										await update({ reset: false });
										if (result.type === 'success') {
											if (result.data?.readingChoiceSaved) toast.success('Reading choice saved.');
											if (result.data?.error) toast.error(String(result.data.error));
										}
									};
								}}
								class="contents"
							>
								<input type="hidden" name="readerId" value={`attendee:${attendee.id}`} />
								<input type="hidden" name="bookId" value={choice.bookId} />
								<div class="min-w-52 flex-1">
									<p class="font-medium">{attendee.name}</p>
									<p class="text-sm text-muted-foreground">{book.title}</p>
								</div>
								<NativeSelect
									class="h-10"
									name="readingStatus"
									aria-label={`Reading status for ${attendee.name}`}
									value={choice.readingStatus}
								>
									<NativeSelectOption value="considering">Considering</NativeSelectOption>
									<NativeSelectOption value="planned">Planning to read</NativeSelectOption>
									<NativeSelectOption value="reading">Reading</NativeSelectOption>
									<NativeSelectOption value="finished">Finished</NativeSelectOption>
									<NativeSelectOption value="did_not_finish">Did not finish</NativeSelectOption>
								</NativeSelect>
								<Button type="submit" class="h-10" variant="outline" disabled={saving}>Save</Button>
							</form>
							{#if linkedBookStatus(book.id) === 'featured'}
								<Badge variant="secondary">Featured</Badge>
							{:else}
								<form
									method="POST"
									action="?/promoteReadingChoice"
									use:enhance={() => {
										saving = true;
										return async ({ result, update }) => {
											saving = false;
											await update({ reset: false });
											if (result.type === 'success' && result.data?.readingChoicePromoted) {
												toast.success('Book linked as featured.');
											}
										};
									}}
								>
									<input type="hidden" name="bookId" value={book.id} />
									<Button type="submit" variant="outline" class="h-10" disabled={saving}
										>Link as Featured</Button
									>
								</form>
							{/if}
							<ConfirmButton
								confirmText="Remove this reading choice?"
								formAction="?/removeReadingChoice"
								formData={{
									attendeeId: attendee.id,
									bookId: choice.bookId
								}}
								variant="ghost"
								size="icon"
								class="h-10 w-10"
							>
								<XIcon class="h-4 w-4" />
							</ConfirmButton>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">No reading choices recorded yet.</p>
			{/if}

			{#if showAddReadingChoice}
				<form
					id="add-reading-choice"
					method="POST"
					action="?/upsertReadingChoice"
					use:enhance={() => {
						saving = true;
						return async ({ result, update }) => {
							saving = false;
							await update({ reset: false });
							if (result.type === 'success') {
								if (result.data?.readingChoiceSaved) {
									toast.success('Reading choice saved.');
									readReaderId = '';
									readBookId = undefined;
									readBookUrl = null;
									showAddReadingChoice = false;
								} else if (result.data?.readingChoiceQueued) {
									toast.success('The book is being added from the URL.');
									readReaderId = '';
									readBookUrl = null;
									showAddReadingChoice = false;
								}
								if (result.data?.error) toast.error(String(result.data.error));
							}
						};
					}}
					class="space-y-4 rounded-lg border p-4"
				>
					<div class="grid gap-4">
						<div class="space-y-2">
							<Label for="read-reader">Reader</Label>
							<NativeSelect
								id="read-reader"
								name="readerId"
								bind:value={readReaderId}
								class="w-full"
							>
								<NativeSelectOption value="">Choose a member or guest</NativeSelectOption>
								{#each data.allUsers.filter((user) => user.status === 'active') as user (user.id)}
									<NativeSelectOption value={`user:${user.id}`}
										>{user.displayName}</NativeSelectOption
									>
								{/each}
								{#each data.guestAttendees as attendee (attendee.id)}
									<NativeSelectOption value={`attendee:${attendee.id}`}
										>{attendee.name} (guest)</NativeSelectOption
									>
								{/each}
							</NativeSelect>
						</div>
						<div class="space-y-2">
							<Label>Book</Label>
							<BookPicker
								books={readingBookPickerItems}
								bind:selectedId={readBookId}
								bind:selectedUrl={readBookUrl}
								name="bookId"
								urlName="url"
								allowUrl
								placeholder="Search club books or enter a URL..."
							/>
						</div>
						<div class="space-y-2">
							<Label for="read-status">Reading Status</Label>
							<NativeSelect class="w-full" id="read-status" name="readingStatus" value="planned">
								<NativeSelectOption value="considering">Considering</NativeSelectOption>
								<NativeSelectOption value="planned">Planning to read</NativeSelectOption>
								<NativeSelectOption value="reading">Reading</NativeSelectOption>
								<NativeSelectOption value="finished">Finished</NativeSelectOption>
								<NativeSelectOption value="did_not_finish">Did not finish</NativeSelectOption>
							</NativeSelect>
						</div>
					</div>
					<div class="flex justify-end gap-2">
						<Button type="button" variant="ghost" onclick={() => (showAddReadingChoice = false)}>
							Cancel
						</Button>
						<Button
							type="submit"
							class="h-10 w-full md:w-auto"
							disabled={saving || !readReaderId || (!readBookId && !readBookUrl)}
						>
							<PlusIcon class="h-4 w-4" />
							Record
						</Button>
					</div>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Linked books -->
	<Card.Root class={books.length === 0 ? 'hidden' : undefined}>
		<Card.Header>
			<div class="flex items-center gap-2">
				<BookOpenIcon class="h-5 w-5 text-primary" />
				<Card.Title class="text-base">Books ({books.length})</Card.Title>
			</div>
		</Card.Header>
		<Card.Content class="p-0">
			{#if books.length > 0}
				<div class="divide-y">
					{#each books as entry (entry.book.id)}
						<div
							class="flex flex-wrap items-center gap-3 px-4 py-3 {entry.book.deletedAt
								? 'opacity-60'
								: ''}"
						>
							<form
								method="POST"
								action="?/updateLink"
								use:enhance={() => {
									saving = true;
									return async ({ result, update }) => {
										saving = false;
										await update({ reset: false });
										if (result.type === 'success') {
											if (result.data?.linkUpdated) toast.success('Updated.');
											if (result.data?.error) toast.error(String(result.data.error));
										}
									};
								}}
								class="contents"
							>
								<input type="hidden" name="kind" value="book" />
								<input type="hidden" name="subjectId" value={entry.book.id} />
								{#if entry.book.coverUrl}
									<img
										src={entry.book.coverUrl}
										alt=""
										class="h-10 w-7 shrink-0 rounded object-cover"
									/>
								{:else}
									<div class="flex h-10 w-7 shrink-0 items-center justify-center rounded bg-muted">
										<BookOpenIcon class="h-3 w-3 text-muted-foreground" />
									</div>
								{/if}
								<a
									class="min-w-40 flex-1 truncate font-medium hover:underline {entry.book.deletedAt
										? 'line-through'
										: ''}"
									href={resolve('/admin/books/[slug]', { slug: entry.book.slug })}
								>
									{entry.book.title}
									{#if entry.book.authorText}
										<span class="font-normal text-muted-foreground">
											— {entry.book.authorText}</span
										>
									{/if}
								</a>
								<div class="flex items-center gap-2">
									<Label for="status-b-{entry.book.id}" class="text-xs">Status</Label>
									<NativeSelect
										id="status-b-{entry.book.id}"
										name="status"
										value={entry.link.status}
									>
										<NativeSelectOption value="starter">Starter book</NativeSelectOption>
										<NativeSelectOption value="featured">Featured reading</NativeSelectOption>
										<NativeSelectOption value="discussed">Discussed at session</NativeSelectOption>
										<NativeSelectOption value="mentioned_off_theme"
											>Mentioned outside the theme</NativeSelectOption
										>
									</NativeSelect>
								</div>
								<Input name="note" class="w-40" placeholder="note" value={entry.link.note ?? ''} />
								<Button type="submit" class="h-10" variant="outline" disabled={saving}>Save</Button>
							</form>
							<ConfirmButton
								confirmText="Remove this book from session?"
								formAction="?/removeLink"
								formData={{ kind: 'book', subjectId: entry.book.id }}
								variant="ghost"
								size="icon"
								class="h-10 w-10"
							>
								<XIcon class="h-4 w-4" />
							</ConfirmButton>
						</div>
					{/each}
				</div>
			{:else}
				<div class="px-4 py-6 text-sm text-muted-foreground">No books linked yet.</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Linked series -->
	<Card.Root class={seriesLinks.length === 0 ? 'hidden' : undefined}>
		<Card.Header>
			<div class="flex items-center gap-2">
				<LibraryIcon class="h-5 w-5 text-primary" />
				<Card.Title class="text-base">Series ({seriesLinks.length})</Card.Title>
			</div>
		</Card.Header>
		<Card.Content class="p-0">
			{#if seriesLinks.length > 0}
				<div class="divide-y">
					{#each seriesLinks as entry (entry.series.id)}
						<div
							class="flex flex-wrap items-center gap-3 px-4 py-3 {entry.series.deletedAt
								? 'opacity-60'
								: ''}"
						>
							<form
								method="POST"
								action="?/updateLink"
								use:enhance={() => {
									saving = true;
									return async ({ result, update }) => {
										saving = false;
										await update({ reset: false });
										if (result.type === 'success') {
											if (result.data?.linkUpdated) toast.success('Updated.');
											if (result.data?.error) toast.error(String(result.data.error));
										}
									};
								}}
								class="contents"
							>
								<input type="hidden" name="kind" value="series" />
								<input type="hidden" name="subjectId" value={entry.series.id} />
								{#if entry.series.coverUrl}
									<img
										src={entry.series.coverUrl}
										alt=""
										class="h-10 w-7 shrink-0 rounded object-cover"
									/>
								{:else}
									<div class="flex h-10 w-7 shrink-0 items-center justify-center rounded bg-muted">
										<LibraryIcon class="h-3 w-3 text-muted-foreground" />
									</div>
								{/if}
								<a
									class="min-w-40 flex-1 truncate font-medium hover:underline {entry.series
										.deletedAt
										? 'line-through'
										: ''}"
									href={resolve('/admin/series/[slug]', { slug: entry.series.slug })}
								>
									{entry.series.title}
									{#if entry.series.authorText}
										<span class="font-normal text-muted-foreground">
											— {entry.series.authorText}</span
										>
									{/if}
								</a>
								<div class="flex items-center gap-2">
									<Label for="status-s-{entry.series.id}" class="text-xs">Status</Label>
									<NativeSelect
										id="status-s-{entry.series.id}"
										name="status"
										value={entry.link.status}
									>
										<NativeSelectOption value="starter">Starter selection</NativeSelectOption>
										<NativeSelectOption value="featured">Featured selection</NativeSelectOption>
										<NativeSelectOption value="discussed">Discussed at session</NativeSelectOption>
										<NativeSelectOption value="mentioned_off_theme"
											>Mentioned outside the theme</NativeSelectOption
										>
									</NativeSelect>
								</div>
								<Input name="note" class="w-40" placeholder="note" value={entry.link.note ?? ''} />
								<Button type="submit" class="h-10" variant="outline" disabled={saving}>Save</Button>
							</form>
							<ConfirmButton
								confirmText="Remove this series from session?"
								formAction="?/removeLink"
								formData={{ kind: 'series', subjectId: entry.series.id }}
								variant="ghost"
								size="icon"
								class="h-10 w-10"
							>
								<XIcon class="h-4 w-4" />
							</ConfirmButton>
						</div>
					{/each}
				</div>
			{:else}
				<div class="px-4 py-6 text-sm text-muted-foreground">No series linked yet.</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Linked authors -->
	<Card.Root class={authorLinks.length === 0 ? 'hidden' : undefined}>
		<Card.Header>
			<div class="flex items-center gap-2">
				<UserIcon class="h-5 w-5 text-primary" />
				<Card.Title class="text-base">Authors ({authorLinks.length})</Card.Title>
			</div>
		</Card.Header>
		<Card.Content class="p-0">
			{#if authorLinks.length > 0}
				<div class="divide-y">
					{#each authorLinks as entry (entry.author.id)}
						<div
							class="flex flex-wrap items-center gap-3 px-4 py-3 {entry.author.deletedAt
								? 'opacity-60'
								: ''}"
						>
							<form
								method="POST"
								action="?/updateLink"
								use:enhance={() => {
									saving = true;
									return async ({ result, update }) => {
										saving = false;
										await update({ reset: false });
										if (result.type === 'success') {
											if (result.data?.linkUpdated) toast.success('Updated.');
											if (result.data?.error) toast.error(String(result.data.error));
										}
									};
								}}
								class="contents"
							>
								<input type="hidden" name="kind" value="author" />
								<input type="hidden" name="subjectId" value={entry.author.id} />
								{#if entry.author.photoUrl}
									<img
										src={entry.author.photoUrl}
										alt=""
										class="h-10 w-10 shrink-0 rounded object-cover"
									/>
								{:else}
									<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
										<UserIcon class="h-3 w-3 text-muted-foreground" />
									</div>
								{/if}
								<a
									class="min-w-40 flex-1 truncate font-medium hover:underline {entry.author
										.deletedAt
										? 'line-through'
										: ''}"
									href={resolve('/admin/authors/[slug]', { slug: entry.author.slug })}
								>
									{entry.author.name}
								</a>
								<div class="flex items-center gap-2">
									<Label for="status-a-{entry.author.id}" class="text-xs">Status</Label>
									<NativeSelect
										id="status-a-{entry.author.id}"
										name="status"
										value={entry.link.status}
									>
										<NativeSelectOption value="starter">Starter selection</NativeSelectOption>
										<NativeSelectOption value="featured">Featured selection</NativeSelectOption>
										<NativeSelectOption value="discussed">Discussed at session</NativeSelectOption>
										<NativeSelectOption value="mentioned_off_theme"
											>Mentioned outside the theme</NativeSelectOption
										>
									</NativeSelect>
								</div>
								<Input name="note" class="w-40" placeholder="note" value={entry.link.note ?? ''} />
								<Button type="submit" class="h-10" variant="outline" disabled={saving}>Save</Button>
							</form>
							<ConfirmButton
								confirmText="Remove this author from session?"
								formAction="?/removeLink"
								formData={{ kind: 'author', subjectId: entry.author.id }}
								variant="ghost"
								size="icon"
								class="h-10 w-10"
							>
								<XIcon class="h-4 w-4" />
							</ConfirmButton>
						</div>
					{/each}
				</div>
			{:else}
				<div class="px-4 py-6 text-sm text-muted-foreground">No authors linked yet.</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Add link from existing -->
	{#if showLinkForms}
		<div class="flex justify-end">
			<Button variant="ghost" size="sm" onclick={() => (showLinkForms = false)}>Cancel</Button>
		</div>
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Link an Existing Library Item</Card.Title>
				<Card.Description>
					Choose a book, series, or author that is already in the club library.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/addLink"
					use:enhance={() => {
						saving = true;
						return async ({ result, update }) => {
							saving = false;
							await update();
							if (result.type === 'success') {
								if (result.data?.linkAdded) {
									toast.success('Linked to session.');
									addBookId = undefined;
									addSeriesId = undefined;
									addAuthorId = undefined;
									showLinkForms = false;
								}
								if (result.data?.error) toast.error(String(result.data.error));
							}
						};
					}}
					class="space-y-4"
				>
					<div class="grid gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
						<div class="space-y-2">
							<Label>Kind</Label>
							<div
								class="grid h-10 grid-cols-3 gap-1 rounded-lg bg-muted p-1"
								role="group"
								aria-label="Library item kind"
							>
								<Button
									type="button"
									size="sm"
									class="h-8"
									variant={addKind === 'book' ? 'default' : 'ghost'}
									aria-pressed={addKind === 'book'}
									onclick={() => (addKind = 'book')}
								>
									Book
								</Button>
								<Button
									type="button"
									size="sm"
									class="h-8"
									variant={addKind === 'series' ? 'default' : 'ghost'}
									aria-pressed={addKind === 'series'}
									onclick={() => (addKind = 'series')}
								>
									Series
								</Button>
								<Button
									type="button"
									size="sm"
									class="h-8"
									variant={addKind === 'author' ? 'default' : 'ghost'}
									aria-pressed={addKind === 'author'}
									onclick={() => (addKind = 'author')}
								>
									Author
								</Button>
							</div>
						</div>
						<input type="hidden" name="kind" value={addKind} />
						<div class="min-w-0 space-y-2">
							<Label
								>{addKind === 'book' ? 'Book' : addKind === 'series' ? 'Series' : 'Author'}</Label
							>
							{#if addKind === 'book'}
								<BookPicker books={bookPickerItems} bind:selectedId={addBookId} name="subjectId" />
							{:else if addKind === 'series'}
								<SeriesPicker
									series={seriesPickerItems}
									bind:selectedId={addSeriesId}
									name="subjectId"
								/>
							{:else}
								<AuthorPicker
									authors={authorPickerItems}
									bind:selectedId={addAuthorId}
									name="subjectId"
								/>
							{/if}
						</div>
					</div>
					<div class="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)_auto] md:items-end">
						<div class="space-y-2">
							<Label for="add-status">Status</Label>
							<NativeSelect class="w-full" id="add-status" name="status" bind:value={addStatus}>
								<NativeSelectOption value="starter">Starter selection</NativeSelectOption>
								<NativeSelectOption value="featured">Featured selection</NativeSelectOption>
								<NativeSelectOption value="discussed">Discussed at session</NativeSelectOption>
								<NativeSelectOption value="mentioned_off_theme"
									>Mentioned outside the theme</NativeSelectOption
								>
							</NativeSelect>
						</div>
						<div class="space-y-2">
							<Label for="add-note">Note</Label>
							<Input id="add-note" name="note" placeholder="Optional context for this session" />
						</div>
						<Button
							class="h-10 w-full md:w-auto"
							type="submit"
							disabled={saving || !addSubjectSelected}
						>
							<PlusIcon class="h-4 w-4" />
							Link Item
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>

		<!-- Add link from external subject URL -->
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Link URLs in Batches</Card.Title>
				<Card.Description>
					Paste one Hardcover or Goodreads book, series, or author URL per line in the matching
					status group. New library items are queued individually and auto-linked once resolved.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/addLinkFromUrl"
					use:enhance={() => {
						saving = true;
						return async ({ result, update }) => {
							saving = false;
							await update({ reset: false });
							if (result.type === 'success') {
								if (result.data?.batchLinksAdded) {
									const resolvedCount = Number(result.data.resolvedCount ?? 0);
									const queuedCount = Number(result.data.queuedCount ?? 0);
									const duplicateCount = Number(result.data.duplicateCount ?? 0);
									const parts = [
										resolvedCount > 0 ? `${resolvedCount} linked` : '',
										queuedCount > 0 ? `${queuedCount} queued` : '',
										duplicateCount > 0
											? `${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} skipped`
											: ''
									].filter(Boolean);
									toast.success(`Batch complete: ${parts.join(', ')}.`);
									starterUrls = '';
									featuredUrls = '';
									discussedUrls = '';
									mentionedOffThemeUrls = '';
								}
								if (result.data?.error) toast.error(String(result.data.error));
							}
							if (result.type === 'failure' && result.data?.error) {
								toast.error(String(result.data.error));
							}
						};
					}}
					class="space-y-4"
				>
					<div class="grid gap-4 md:grid-cols-2">
						<div class="space-y-2">
							<Label for="starter-urls">Starter</Label>
							<Textarea
								id="starter-urls"
								name="starterUrls"
								rows={4}
								placeholder="One URL per line"
								bind:value={starterUrls}
							/>
						</div>
						<div class="space-y-2">
							<Label for="featured-urls">Featured</Label>
							<Textarea
								id="featured-urls"
								name="featuredUrls"
								rows={4}
								placeholder="One URL per line"
								bind:value={featuredUrls}
							/>
						</div>
						<div class="space-y-2">
							<Label for="discussed-urls">Discussed</Label>
							<Textarea
								id="discussed-urls"
								name="discussedUrls"
								rows={4}
								placeholder="One URL per line"
								bind:value={discussedUrls}
							/>
						</div>
						<div class="space-y-2">
							<Label for="off-theme-urls">Mentioned off theme</Label>
							<Textarea
								id="off-theme-urls"
								name="mentionedOffThemeUrls"
								rows={4}
								placeholder="One URL per line"
								bind:value={mentionedOffThemeUrls}
							/>
						</div>
					</div>
					<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
						<div class="space-y-2">
							<Label for="url-note">Note</Label>
							<Input id="url-note" name="note" placeholder="Optional context for this session" />
						</div>
						<Button
							class="h-10 w-full md:w-auto"
							type="submit"
							disabled={saving || batchUrlCount === 0}
						>
							<LinkIcon class="h-4 w-4" />
							{saving
								? 'Linking…'
								: `Link ${batchUrlCount || ''} URL${batchUrlCount === 1 ? '' : 's'}`}
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{:else}
		<Button variant="outline" onclick={() => (showLinkForms = true)}>
			<PlusIcon class="h-4 w-4" />
			Link Library Item
		</Button>
	{/if}
</div>
