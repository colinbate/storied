<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import BookPicker from '$lib/components/admin/book-picker.svelte';
	import MemberPicker from '$lib/components/admin/member-picker.svelte';
	import SeriesPicker from '$lib/components/admin/series-picker.svelte';
	import ConfirmButton from '$lib/components/confirm-button.svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import LinkIcon from '@lucide/svelte/icons/link';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { toast } from 'svelte-sonner';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';

	let { data } = $props();
	let saving = $state(false);

	type LinkKind = 'book' | 'series';
	type SubjectStatus = 'starter' | 'featured' | 'discussed' | 'mentioned_off_theme';
	let addKind = $state<LinkKind>('book');
	let addBookId = $state<string | undefined>(undefined);
	let addSeriesId = $state<string | undefined>(undefined);
	let addStatus = $state<SubjectStatus>('starter');
	let participantUserId = $state<string | undefined>(undefined);
	let participantStatus = $state<'attending' | 'not_attending' | 'maybe' | 'attended'>('attended');
	let readUserId = $state<string | undefined>(undefined);
	let readKind = $state<LinkKind>('book');
	let readBookId = $state<string | undefined>(undefined);
	let readSeriesId = $state<string | undefined>(undefined);

	let urlStatus = $state<SubjectStatus>('starter');

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

	const books = $derived(data.linkedSubjects.filter((l) => l.kind === 'book'));
	const seriesLinks = $derived(data.linkedSubjects.filter((l) => l.kind === 'series'));
	const activeUsers = $derived(data.allUsers.filter((user) => user.status === 'active'));
	const participantUserIds = $derived(new Set(data.participants.map((p) => p.user.id)));
	const addableUsers = $derived(activeUsers.filter((u) => !participantUserIds.has(u.id)));
	const linkedBookPickerItems = $derived(
		books.map((entry) => ({
			id: entry.book.id,
			title: entry.book.title,
			authorText: entry.book.authorText
		}))
	);
	const linkedSeriesPickerItems = $derived(
		seriesLinks.map((entry) => ({
			id: entry.series.id,
			title: entry.series.title,
			authorText: entry.series.authorText
		}))
	);

	function readSubjectTitle(read: { subjectType: string; subjectId: string }) {
		if (read.subjectType === 'book') {
			return books.find((entry) => entry.book.id === read.subjectId)?.book.title ?? 'Unknown book';
		}
		return (
			seriesLinks.find((entry) => entry.series.id === read.subjectId)?.series.title ??
			'Unknown series'
		);
	}
</script>

<svelte:head>
	<title>{data.session.title} — Session Admin — The Archive</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-2">
		<Button variant="ghost" size="icon-sm" href={resolve('/admin/sessions')}>
			<ArrowLeftIcon class="h-4 w-4" />
		</Button>
		<h1 class="text-2xl font-bold">{data.session.title}</h1>
		<Badge variant={data.session.status === 'current' ? 'default' : 'secondary'}>
			{data.session.status}
		</Badge>
		{#if data.session.themeTitle ?? data.session.theme}
			<Badge variant="secondary">{data.session.themeTitle ?? data.session.theme}</Badge>
		{/if}
	</div>

	<!-- Session metadata -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Session Details</Card.Title>
			<Card.Description>Slug: <span class="font-mono">{data.session.slug}</span></Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/updateSession"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						saving = false;
						await update();
						if (result.type === 'success') {
							if (result.data?.updated) toast.success('Session updated.');
							if (result.data?.error) toast.error(String(result.data.error));
						}
					};
				}}
				class="space-y-4"
			>
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
						<Label for="status">Status</Label>
						<NativeSelect id="status" name="status" value={data.session.status}>
							<NativeSelectOption value="draft">draft</NativeSelectOption>
							<NativeSelectOption value="current">current</NativeSelectOption>
							<NativeSelectOption value="past">past</NativeSelectOption>
						</NativeSelect>
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
						<Input id="locationName" name="locationName" value={data.session.locationName ?? ''} />
					</div>
					<div class="space-y-2">
						<Label for="themeTitle">Theme Title</Label>
						<Input
							id="themeTitle"
							name="themeTitle"
							value={data.session.themeTitle ?? data.session.theme ?? ''}
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
						<Label for="bodySource">Body</Label>
						<Textarea
							id="bodySource"
							name="bodySource"
							rows={8}
							value={data.session.bodySource ?? ''}
						/>
					</div>
					<div class="space-y-2">
						<Label for="rsvpSlug">RSVP Slug</Label>
						<Input id="rsvpSlug" name="rsvpSlug" value={data.session.rsvpSlug ?? ''} />
					</div>
					<div class="space-y-2">
						<Label for="astroPath">Astro Path</Label>
						<Input id="astroPath" name="astroPath" value={data.session.astroPath ?? ''} />
					</div>
					<div class="space-y-2">
						<Label for="externalUrl">External URL</Label>
						<Input
							id="externalUrl"
							name="externalUrl"
							type="url"
							value={data.session.externalUrl ?? ''}
						/>
					</div>
					<label class="flex items-center gap-2 pt-8 text-sm">
						<input
							name="isPublic"
							type="checkbox"
							checked={data.session.isPublic}
							class="rounded border-input"
						/>
						Public
					</label>
				</div>
				<Button type="submit" disabled={saving}>
					{saving ? 'Saving…' : 'Save Session'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Participants -->
	<Card.Root>
		<Card.Header>
			<div class="flex items-center gap-2">
				<UsersIcon class="h-5 w-5 text-primary" />
				<Card.Title class="text-base">Participants ({data.participants.length})</Card.Title>
			</div>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if data.participants.length > 0}
				<div class="divide-y rounded-md border">
					{#each data.participants as { participant, user } (user.id)}
						<form
							method="POST"
							action="?/upsertParticipant"
							use:enhance={() => {
								saving = true;
								return async ({ result, update }) => {
									saving = false;
									await update();
									if (result.type === 'success') {
										if (result.data?.participantSaved) toast.success('Participant saved.');
										if (result.data?.error) toast.error(String(result.data.error));
									}
								};
							}}
							class="flex flex-wrap items-center gap-3 px-4 py-3"
						>
							<input type="hidden" name="userId" value={user.id} />
							<div class="min-w-40 flex-1">
								<p class="font-medium">{user.displayName}</p>
								<p class="text-xs text-muted-foreground">{user.email}</p>
							</div>
							<div class="flex items-center gap-2">
								<Label for="attendance-{user.id}" class="text-xs">Attendance</Label>
								<NativeSelect
									id="attendance-{user.id}"
									name="attendanceStatus"
									value={participant.attendanceStatus}
								>
									<NativeSelectOption value="attending">attending</NativeSelectOption>
									<NativeSelectOption value="not_attending">not attending</NativeSelectOption>
									<NativeSelectOption value="maybe">maybe</NativeSelectOption>
									<NativeSelectOption value="attended">attended</NativeSelectOption>
								</NativeSelect>
							</div>
							<Input name="note" class="w-48" placeholder="note" value={participant.note ?? ''} />
							<Button type="submit" size="sm" variant="outline" disabled={saving}>Save</Button>
							<ConfirmButton
								confirmText="Remove this participant?"
								formAction="?/removeParticipant"
								formData={{ userId: user.id }}
								variant="ghost"
								size="icon-sm"
							>
								<XIcon class="h-4 w-4" />
							</ConfirmButton>
						</form>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">No participants recorded yet.</p>
			{/if}

			<form
				method="POST"
				action="?/upsertParticipant"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						saving = false;
						await update();
						if (result.type === 'success') {
							if (result.data?.participantSaved) {
								toast.success('Participant added.');
								participantUserId = undefined;
							}
							if (result.data?.error) toast.error(String(result.data.error));
						}
					};
				}}
				class="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_12rem_minmax(0,1fr)_auto]"
			>
				<div class="space-y-1">
					<Label for="participant-user">Member</Label>
					<MemberPicker
						members={addableUsers}
						bind:selectedId={participantUserId}
						name="userId"
						placeholder="Search members..."
					/>
				</div>
				<div class="space-y-1">
					<Label for="participant-status">Attendance</Label>
					<NativeSelect
						id="participant-status"
						name="attendanceStatus"
						bind:value={participantStatus}
					>
						<NativeSelectOption value="attended">attended</NativeSelectOption>
						<NativeSelectOption value="attending">attending</NativeSelectOption>
						<NativeSelectOption value="maybe">maybe</NativeSelectOption>
						<NativeSelectOption value="not_attending">not attending</NativeSelectOption>
					</NativeSelect>
				</div>
				<div class="flex-1 space-y-1">
					<Label for="participant-note">Note</Label>
					<Input id="participant-note" name="note" placeholder="optional" />
				</div>
				<Button type="submit" class="self-end" disabled={saving || !participantUserId}>
					<PlusIcon class="h-4 w-4" />
					Add
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Participant reads -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base"
				>Member Session Reads ({data.participantReads.length})</Card.Title
			>
			<Card.Description
				>Record what each member read, considered, or mentioned for this session.</Card.Description
			>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if data.participantReads.length > 0}
				<div class="divide-y rounded-md border">
					{#each data.participantReads as { read, user } (user.id + read.subjectType + read.subjectId)}
						<form
							method="POST"
							action="?/upsertParticipantSubject"
							use:enhance={() => {
								saving = true;
								return async ({ result, update }) => {
									saving = false;
									await update();
									if (result.type === 'success') {
										if (result.data?.participantSubjectSaved) toast.success('Session read saved.');
										if (result.data?.error) toast.error(String(result.data.error));
									}
								};
							}}
							class="flex flex-wrap items-center gap-3 px-4 py-3"
						>
							<input type="hidden" name="userId" value={user.id} />
							<input type="hidden" name="kind" value={read.subjectType} />
							<input type="hidden" name="subjectId" value={read.subjectId} />
							<div class="min-w-52 flex-1">
								<p class="font-medium">{user.displayName}</p>
								<p class="text-sm text-muted-foreground">{readSubjectTitle(read)}</p>
							</div>
							<NativeSelect name="relationType" value={read.relationType}>
								<NativeSelectOption value="read_for_session">read for session</NativeSelectOption>
								<NativeSelectOption value="considered">considered</NativeSelectOption>
								<NativeSelectOption value="mentioned">mentioned</NativeSelectOption>
							</NativeSelect>
							<label class="flex items-center gap-2 text-sm">
								<input
									name="isPrimaryPick"
									type="checkbox"
									checked={read.isPrimaryPick}
									class="rounded border-input"
								/>
								Primary
							</label>
							<label class="flex items-center gap-2 text-sm">
								<input
									name="isThemeRelated"
									type="checkbox"
									checked={read.isThemeRelated}
									class="rounded border-input"
								/>
								Theme
							</label>
							<Input name="note" class="w-44" placeholder="note" value={read.note ?? ''} />
							<Button type="submit" size="sm" variant="outline" disabled={saving}>Save</Button>
							<ConfirmButton
								confirmText="Remove this session read?"
								formAction="?/removeParticipantSubject"
								formData={{ userId: user.id, kind: read.subjectType, subjectId: read.subjectId }}
								variant="ghost"
								size="icon-sm"
							>
								<XIcon class="h-4 w-4" />
							</ConfirmButton>
						</form>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">No member reads recorded yet.</p>
			{/if}

			<form
				method="POST"
				action="?/upsertParticipantSubject"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						saving = false;
						await update();
						if (result.type === 'success') {
							if (result.data?.participantSubjectSaved) {
								toast.success('Session read saved.');
								readBookId = undefined;
								readSeriesId = undefined;
							}
							if (result.data?.error) toast.error(String(result.data.error));
						}
					};
				}}
				class="space-y-4"
			>
				<div class="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_10rem]">
					<div class="space-y-1">
						<Label for="read-user">Member</Label>
						<MemberPicker
							members={activeUsers}
							bind:selectedId={readUserId}
							name="userId"
							placeholder="Search members..."
						/>
					</div>
					<div class="space-y-1">
						<Label>Kind</Label>
						<div class="flex gap-2">
							<Button
								type="button"
								size="sm"
								variant={readKind === 'book' ? 'default' : 'outline'}
								onclick={() => (readKind = 'book')}
							>
								Book
							</Button>
							<Button
								type="button"
								size="sm"
								variant={readKind === 'series' ? 'default' : 'outline'}
								onclick={() => (readKind = 'series')}
							>
								Series
							</Button>
						</div>
					</div>
				</div>
				<div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
					<input type="hidden" name="kind" value={readKind} />
					<div class="space-y-1">
						<Label>{readKind === 'book' ? 'Book' : 'Series'}</Label>
						{#if readKind === 'book'}
							<BookPicker
								books={linkedBookPickerItems}
								bind:selectedId={readBookId}
								name="subjectId"
								placeholder="Search session books..."
							/>
						{:else}
							<SeriesPicker
								series={linkedSeriesPickerItems}
								bind:selectedId={readSeriesId}
								name="subjectId"
								placeholder="Search session series..."
							/>
						{/if}
					</div>
					<div class="space-y-1">
						<Label for="read-relation">Relation</Label>
						<NativeSelect id="read-relation" name="relationType" value="read_for_session">
							<NativeSelectOption value="read_for_session">read for session</NativeSelectOption>
							<NativeSelectOption value="considered">considered</NativeSelectOption>
							<NativeSelectOption value="mentioned">mentioned</NativeSelectOption>
						</NativeSelect>
					</div>
					<div class="space-y-1">
						<Label>Flags</Label>
						<div
							class="flex min-h-11 flex-wrap items-center gap-4 rounded-md border px-3 py-2 text-sm"
						>
							<label class="flex items-center gap-2">
								<input name="isPrimaryPick" type="checkbox" class="rounded border-input" />
								Primary
							</label>
							<label class="flex items-center gap-2">
								<input name="isThemeRelated" type="checkbox" checked class="rounded border-input" />
								Theme
							</label>
						</div>
					</div>
				</div>
				<div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
					<div class="space-y-1">
						<Label for="read-note">Note</Label>
						<Input id="read-note" name="note" placeholder="optional" />
					</div>
					<Button
						type="submit"
						class="self-end"
						disabled={saving || !readUserId || (readKind === 'book' ? !readBookId : !readSeriesId)}
					>
						<PlusIcon class="h-4 w-4" />
						Record
					</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Linked books -->
	<Card.Root>
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
						<form
							method="POST"
							action="?/updateLink"
							use:enhance={() => {
								saving = true;
								return async ({ result, update }) => {
									saving = false;
									await update();
									if (result.type === 'success') {
										if (result.data?.linkUpdated) toast.success('Updated.');
										if (result.data?.error) toast.error(String(result.data.error));
									}
								};
							}}
							class="flex flex-wrap items-center gap-3 px-4 py-3 {entry.book.deletedAt
								? 'opacity-60'
								: ''}"
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
									<span class="font-normal text-muted-foreground"> — {entry.book.authorText}</span>
								{/if}
							</a>
							<div class="flex items-center gap-2">
								<Label for="status-b-{entry.book.id}" class="text-xs">Status</Label>
								<NativeSelect id="status-b-{entry.book.id}" name="status" value={entry.link.status}>
									<NativeSelectOption value="starter">starter</NativeSelectOption>
									<NativeSelectOption value="featured">featured</NativeSelectOption>
									<NativeSelectOption value="discussed">discussed</NativeSelectOption>
									<NativeSelectOption value="mentioned_off_theme"
										>mentioned off theme</NativeSelectOption
									>
								</NativeSelect>
							</div>
							<Input name="note" class="w-40" placeholder="note" value={entry.link.note ?? ''} />
							<Button type="submit" size="sm" variant="outline" disabled={saving}>Save</Button>
							<ConfirmButton
								confirmText="Remove this book from session?"
								formAction="?/removeLink"
								formData={{ kind: 'book', subjectId: entry.book.id }}
								variant="ghost"
								size="icon-sm"
							>
								<XIcon class="h-4 w-4" />
							</ConfirmButton>
						</form>
					{/each}
				</div>
			{:else}
				<div class="px-4 py-6 text-sm text-muted-foreground">No books linked yet.</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Linked series -->
	<Card.Root>
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
						<form
							method="POST"
							action="?/updateLink"
							use:enhance={() => {
								saving = true;
								return async ({ result, update }) => {
									saving = false;
									await update();
									if (result.type === 'success') {
										if (result.data?.linkUpdated) toast.success('Updated.');
										if (result.data?.error) toast.error(String(result.data.error));
									}
								};
							}}
							class="flex flex-wrap items-center gap-3 px-4 py-3 {entry.series.deletedAt
								? 'opacity-60'
								: ''}"
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
								class="min-w-40 flex-1 truncate font-medium hover:underline {entry.series.deletedAt
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
									<NativeSelectOption value="starter">starter</NativeSelectOption>
									<NativeSelectOption value="featured">featured</NativeSelectOption>
									<NativeSelectOption value="discussed">discussed</NativeSelectOption>
									<NativeSelectOption value="mentioned_off_theme"
										>mentioned off theme</NativeSelectOption
									>
								</NativeSelect>
							</div>
							<Input name="note" class="w-40" placeholder="note" value={entry.link.note ?? ''} />
							<Button type="submit" size="sm" variant="outline" disabled={saving}>Save</Button>
							<ConfirmButton
								confirmText="Remove this series from session?"
								formAction="?/removeLink"
								formData={{ kind: 'series', subjectId: entry.series.id }}
								variant="ghost"
								size="icon-sm"
							>
								<XIcon class="h-4 w-4" />
							</ConfirmButton>
						</form>
					{/each}
				</div>
			{:else}
				<div class="px-4 py-6 text-sm text-muted-foreground">No series linked yet.</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Add link from existing -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Link an Existing Book or Series</Card.Title>
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
							}
							if (result.data?.error) toast.error(String(result.data.error));
						}
					};
				}}
				class="flex flex-wrap items-end gap-2"
			>
				<div class="space-y-1">
					<Label>Kind</Label>
					<div class="flex gap-2">
						<Button
							type="button"
							size="sm"
							variant={addKind === 'book' ? 'default' : 'outline'}
							onclick={() => (addKind = 'book')}
						>
							Book
						</Button>
						<Button
							type="button"
							size="sm"
							variant={addKind === 'series' ? 'default' : 'outline'}
							onclick={() => (addKind = 'series')}
						>
							Series
						</Button>
					</div>
				</div>
				<input type="hidden" name="kind" value={addKind} />
				<div class="min-w-0 flex-1 space-y-1">
					<Label>{addKind === 'book' ? 'Book' : 'Series'}</Label>
					{#if addKind === 'book'}
						<BookPicker books={bookPickerItems} bind:selectedId={addBookId} name="subjectId" />
					{:else}
						<SeriesPicker
							series={seriesPickerItems}
							bind:selectedId={addSeriesId}
							name="subjectId"
						/>
					{/if}
				</div>
				<div class="space-y-1">
					<Label for="add-status">Status</Label>
					<NativeSelect id="add-status" name="status" bind:value={addStatus}>
						<NativeSelectOption value="starter">starter</NativeSelectOption>
						<NativeSelectOption value="featured">featured</NativeSelectOption>
						<NativeSelectOption value="discussed">discussed</NativeSelectOption>
						<NativeSelectOption value="mentioned_off_theme">mentioned off theme</NativeSelectOption>
					</NativeSelect>
				</div>
				<div class="flex-1 space-y-1">
					<Label for="add-note">Note</Label>
					<Input id="add-note" name="note" placeholder="optional" />
				</div>
				<Button type="submit" disabled={saving || (addKind === 'book' ? !addBookId : !addSeriesId)}>
					<PlusIcon class="h-4 w-4" />
					Link
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Add link from Goodreads URL -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Link from Goodreads URL</Card.Title>
			<Card.Description>
				Paste a Goodreads book or series URL. If not already in our library, it'll be queued for
				resolution and auto-linked to this session once resolved.
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
						await update();
						if (result.type === 'success') {
							if (result.data?.linkAddedFromResolved) toast.success('Linked to session.');
							if (result.data?.linkQueuedFromUrl)
								toast.success('Queued. Will link to session once resolved.');
							if (result.data?.error) toast.error(String(result.data.error));
						}
					};
				}}
				class="flex flex-wrap items-end gap-2"
			>
				<div class="min-w-0 flex-1 space-y-1">
					<Label for="url-input">Goodreads URL</Label>
					<Input
						id="url-input"
						name="url"
						type="url"
						placeholder="https://www.goodreads.com/book/show/..."
						required
					/>
				</div>
				<div class="space-y-1">
					<Label for="url-status">Status</Label>
					<NativeSelect id="url-status" name="status" bind:value={urlStatus}>
						<NativeSelectOption value="starter">starter</NativeSelectOption>
						<NativeSelectOption value="featured">featured</NativeSelectOption>
						<NativeSelectOption value="discussed">discussed</NativeSelectOption>
						<NativeSelectOption value="mentioned_off_theme">mentioned off theme</NativeSelectOption>
					</NativeSelect>
				</div>
				<div class="flex-1 space-y-1">
					<Label for="url-note">Note</Label>
					<Input id="url-note" name="note" placeholder="optional" />
				</div>
				<Button type="submit" disabled={saving}>
					<LinkIcon class="h-4 w-4" />
					Link
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
