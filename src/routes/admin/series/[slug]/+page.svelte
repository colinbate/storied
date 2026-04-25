<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import GenreMultiPicker from '$lib/components/admin/genre-multi-picker.svelte';
	import BookPicker from '$lib/components/admin/book-picker.svelte';
	import SessionPicker from '$lib/components/admin/session-picker.svelte';
	import ConfirmButton from '$lib/components/confirm-button.svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import LinkIcon from '@lucide/svelte/icons/link';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import { toast } from 'svelte-sonner';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';

	let { data } = $props();
	let saving = $state(false);
	let isComplete = $derived(!!data.series.isComplete);

	let selectedGenres = $derived(
		data.genreLinks.map((g) => ({ id: g.genre.id, name: g.genre.name }))
	);

	let addBookId = $state<string | undefined>(undefined);
	let addBookMode = $state<'existing' | 'url'>('existing');

	let addSessionId = $state<string | undefined>(undefined);
	let addSessionStatus = $state<'starter' | 'featured' | 'discussed' | 'mentioned_off_theme'>(
		'starter'
	);

	function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
		if (status === 'resolved') return 'default';
		if (status === 'pending') return 'secondary';
		if (status === 'failed') return 'destructive';
		return 'outline';
	}

	const genrePickerItems = $derived(data.allGenres.map((g) => ({ id: g.id, name: g.name })));
	const bookPickerItems = $derived(
		data.allBooks
			.filter((b) => !b.deletedAt)
			.filter((b) => !data.bookMemberships.some((m) => m.book.id === b.id))
			.map((b) => ({ id: b.id, title: b.title, authorText: b.authorText }))
	);
	const sessionPickerItems = $derived(
		data.allSessions
			.filter((s) => !data.sessionLinks.some((l) => l.session.id === s.id))
			.map((s) => ({ id: s.id, title: s.title, theme: s.theme }))
	);
</script>

<svelte:head>
	<title>{data.series.title} — Series Admin — The Archive</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-2">
		<Button variant="ghost" size="icon-sm" href={resolve('/admin/series')}>
			<ArrowLeftIcon class="h-4 w-4" />
		</Button>
		<h1 class="text-2xl font-bold {data.series.deletedAt ? 'line-through' : ''}">
			{data.series.title}
		</h1>
		{#if data.series.deletedAt}
			<Badge variant="outline">deleted</Badge>
		{/if}
		{#if !data.series.deletedAt}
			<Button
				variant="outline"
				size="sm"
				href={resolve('/series/[slug]', { slug: data.series.slug })}
				class="ml-auto"
			>
				View Public Page
			</Button>
		{/if}
	</div>

	<!-- Metadata -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Metadata</Card.Title>
			<Card.Description>Slug: <span class="font-mono">{data.series.slug}</span></Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/updateMetadata"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						saving = false;
						await update({ reset: false });
						if (result.type === 'success') {
							if (result.data?.updated) toast.success('Series updated.');
							if (result.data?.error) toast.error(String(result.data.error));
						}
					};
				}}
				class="space-y-4"
			>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2 sm:col-span-2">
						<Label for="title">Title</Label>
						<Input id="title" name="title" value={data.series.title} required />
					</div>
					<div class="space-y-2">
						<Label for="authorText">Author</Label>
						<Input id="authorText" name="authorText" value={data.series.authorText ?? ''} />
					</div>
					<div class="space-y-2">
						<Label for="bookCount">Book Count</Label>
						<Input
							id="bookCount"
							name="bookCount"
							type="number"
							min="0"
							value={data.series.bookCount ?? ''}
						/>
					</div>
					<div class="space-y-2 sm:col-span-2">
						<Label for="coverUrl">Cover URL</Label>
						<Input id="coverUrl" name="coverUrl" type="url" value={data.series.coverUrl ?? ''} />
						{#if data.series.coverUrl}
							<img
								src={data.series.coverUrl}
								alt="Cover of {data.series.title}"
								class="mt-2 h-24 w-16 rounded object-cover"
							/>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="amazonAsin">Amazon ASIN</Label>
						<Input id="amazonAsin" name="amazonAsin" value={data.series.amazonAsin ?? ''} />
					</div>
					<div class="space-y-2">
						<Label for="goodreadsUrl">Goodreads URL</Label>
						<Input
							id="goodreadsUrl"
							name="goodreadsUrl"
							type="url"
							value={data.series.goodreadsUrl ?? ''}
						/>
					</div>
					<div class="flex items-center gap-2 sm:col-span-2">
						<input type="checkbox" id="isComplete" bind:checked={isComplete} class="h-4 w-4" />
						<Label for="isComplete">Series is complete</Label>
						<input type="hidden" name="isComplete" value={isComplete ? '1' : '0'} />
					</div>
					<div class="space-y-2 sm:col-span-2">
						<Label for="description">Description</Label>
						<Textarea
							id="description"
							name="description"
							rows={5}
							value={data.series.description ?? ''}
						/>
					</div>
				</div>
				<div>
					<Button type="submit" disabled={saving}>
						{saving ? 'Saving…' : 'Save Metadata'}
					</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Genres -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Genres</Card.Title>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/saveGenres"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						saving = false;
						await update();
						if (result.type === 'success') {
							if (result.data?.genresUpdated) toast.success('Genres updated.');
							if (result.data?.error) toast.error(String(result.data.error));
						}
					};
				}}
				class="space-y-3"
			>
				<GenreMultiPicker genres={genrePickerItems} {selectedGenres} name="genreIds" />
				<Button type="submit" size="sm" disabled={saving}>Save Genres</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Books in series -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Books</Card.Title>
			<Card.Description>Books that make up this series, in reading order.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4 p-4">
			{#if data.bookMemberships.length > 0}
				<div class="divide-y rounded border">
					{#each data.bookMemberships as m (m.book.id)}
						<form
							method="POST"
							action="?/updateBookMembership"
							use:enhance={() => {
								saving = true;
								return async ({ result, update }) => {
									saving = false;
									await update();
									if (result.type === 'success') {
										if (result.data?.membershipUpdated) toast.success('Updated.');
										if (result.data?.error) toast.error(String(result.data.error));
									}
								};
							}}
							class="flex flex-wrap items-center gap-3 px-3 py-2 {m.book.deletedAt
								? 'opacity-60'
								: ''}"
						>
							<input type="hidden" name="bookId" value={m.book.id} />
							{#if m.book.coverUrl}
								<img src={m.book.coverUrl} alt="" class="h-10 w-7 shrink-0 rounded object-cover" />
							{:else}
								<div class="flex h-10 w-7 shrink-0 items-center justify-center rounded bg-muted">
									<BookOpenIcon class="h-3 w-3 text-muted-foreground" />
								</div>
							{/if}
							<a
								class="min-w-0 flex-1 truncate font-medium hover:underline {m.book.deletedAt
									? 'line-through'
									: ''}"
								href={resolve('/admin/books/[slug]', { slug: m.book.slug })}
							>
								{m.book.title}
								{#if m.book.authorText}
									<span class="font-normal text-muted-foreground"> — {m.book.authorText}</span>
								{/if}
							</a>
							<div class="flex items-center gap-2">
								<Label for="pos-{m.book.id}" class="text-xs">Pos</Label>
								<Input
									id="pos-{m.book.id}"
									name="position"
									class="w-16"
									value={m.link.position ?? ''}
								/>
								<Label for="sort-{m.book.id}" class="text-xs">Sort</Label>
								<Input
									id="sort-{m.book.id}"
									name="positionSort"
									type="number"
									step="0.5"
									class="w-20"
									value={m.link.positionSort ?? ''}
								/>
								<Button type="submit" size="sm" variant="outline" disabled={saving}>Save</Button>
							</div>
							<ConfirmButton
								confirmText="Remove this book from series?"
								formAction="?/removeBook"
								formData={{ bookId: m.book.id }}
								variant="ghost"
								size="icon-sm"
							>
								<XIcon class="h-4 w-4" />
							</ConfirmButton>
						</form>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">No books linked to this series yet.</p>
			{/if}

			<div class="border-t pt-3">
				<div class="mb-2 flex items-center gap-2 text-sm">
					<Button
						size="sm"
						variant={addBookMode === 'existing' ? 'default' : 'outline'}
						onclick={() => (addBookMode = 'existing')}
					>
						Existing
					</Button>
					<Button
						size="sm"
						variant={addBookMode === 'url' ? 'default' : 'outline'}
						onclick={() => (addBookMode = 'url')}
					>
						From URL
					</Button>
				</div>

				{#if addBookMode === 'existing'}
					<form
						method="POST"
						action="?/addBook"
						use:enhance={() => {
							saving = true;
							return async ({ result, update }) => {
								saving = false;
								await update();
								if (result.type === 'success') {
									if (result.data?.bookAdded) {
										toast.success('Book added to series.');
										addBookId = undefined;
									}
									if (result.data?.error) toast.error(String(result.data.error));
								}
							};
						}}
						class="flex flex-wrap items-end gap-2"
					>
						<input type="hidden" name="mode" value="existing" />
						<div class="min-w-0 flex-1 space-y-1">
							<Label>Book</Label>
							<BookPicker books={bookPickerItems} bind:selectedId={addBookId} name="bookId" />
						</div>
						<div class="space-y-1">
							<Label for="add-position">Position</Label>
							<Input id="add-position" name="position" class="w-20" placeholder="e.g. 1" />
						</div>
						<div class="space-y-1">
							<Label for="add-positionSort">Sort</Label>
							<Input
								id="add-positionSort"
								name="positionSort"
								type="number"
								step="0.5"
								class="w-20"
								placeholder="1"
							/>
						</div>
						<Button type="submit" disabled={saving || !addBookId}>
							<PlusIcon class="h-4 w-4" />
							Add
						</Button>
					</form>
				{:else}
					<form
						method="POST"
						action="?/addBook"
						use:enhance={() => {
							saving = true;
							return async ({ result, update }) => {
								saving = false;
								await update();
								if (result.type === 'success') {
									if (result.data?.bookAdded) toast.success('Book added to series.');
									if (result.data?.queuedBook)
										toast.success(
											'Book URL queued. It will be added to this series once resolved.'
										);
									if (result.data?.error) toast.error(String(result.data.error));
								}
							};
						}}
						class="flex flex-wrap items-end gap-2"
					>
						<input type="hidden" name="mode" value="url" />
						<div class="min-w-0 flex-1 space-y-1">
							<Label for="book-url">Goodreads Book URL</Label>
							<Input
								id="book-url"
								name="url"
								type="url"
								placeholder="https://www.goodreads.com/book/show/..."
								required
							/>
						</div>
						<Button type="submit" disabled={saving}>
							<LinkIcon class="h-4 w-4" />
							Queue
						</Button>
					</form>
					<p class="mt-2 text-xs text-muted-foreground">
						The book will be auto-added to this series once the worker resolves it.
					</p>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Session links -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Sessions</Card.Title>
			<Card.Description>Sessions where this series has been discussed or featured.</Card.Description
			>
		</Card.Header>
		<Card.Content class="space-y-4 p-4">
			{#if data.sessionLinks.length > 0}
				<div class="divide-y rounded border">
					{#each data.sessionLinks as link (link.session.id)}
						<form
							method="POST"
							action="?/updateSessionLink"
							use:enhance={() => {
								saving = true;
								return async ({ result, update }) => {
									saving = false;
									await update();
									if (result.type === 'success') {
										if (result.data?.sessionLinkUpdated) toast.success('Updated.');
										if (result.data?.error) toast.error(String(result.data.error));
									}
								};
							}}
							class="flex flex-wrap items-center gap-3 px-3 py-2"
						>
							<input type="hidden" name="sessionId" value={link.session.id} />
							<a
								class="min-w-40 flex-1 truncate font-medium hover:underline"
								href={resolve('/admin/sessions/[slug]', { slug: link.session.slug })}
							>
								{link.session.title}
							</a>
							<div class="flex items-center gap-2">
								<Label for="status-{link.session.id}" class="text-xs">Status</Label>
								<NativeSelect id="status-{link.session.id}" name="status" value={link.link.status}>
									<NativeSelectOption value="starter">starter</NativeSelectOption>
									<NativeSelectOption value="featured">featured</NativeSelectOption>
									<NativeSelectOption value="discussed">discussed</NativeSelectOption>
									<NativeSelectOption value="mentioned_off_theme"
										>mentioned off theme</NativeSelectOption
									>
								</NativeSelect>
							</div>
							<Input name="note" class="w-40" placeholder="note" value={link.link.note ?? ''} />
							<Button type="submit" size="sm" variant="outline" disabled={saving}>Save</Button>
							<ConfirmButton
								confirmText="Remove this session link?"
								formAction="?/removeSessionLink"
								formData={{ sessionId: link.session.id }}
								variant="ghost"
								size="icon-sm"
							>
								<XIcon class="h-4 w-4" />
							</ConfirmButton>
						</form>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">Not linked to any sessions.</p>
			{/if}

			<form
				method="POST"
				action="?/addSessionLink"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						saving = false;
						await update();
						if (result.type === 'success') {
							if (result.data?.sessionLinkAdded) {
								toast.success('Linked to session.');
								addSessionId = undefined;
							}
							if (result.data?.error) toast.error(String(result.data.error));
						}
					};
				}}
				class="flex flex-wrap items-end gap-2 border-t pt-3"
			>
				<div class="min-w-0 flex-1 space-y-1">
					<Label>Session</Label>
					<SessionPicker
						sessions={sessionPickerItems}
						bind:selectedId={addSessionId}
						name="sessionId"
					/>
				</div>
				<div class="space-y-1">
					<Label for="add-status">Status</Label>
					<NativeSelect id="add-status" name="status" bind:value={addSessionStatus}>
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
				<Button type="submit" disabled={saving || !addSessionId}>
					<PlusIcon class="h-4 w-4" />
					Link
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Sources -->
	{#if data.sources.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">External Sources</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<div class="divide-y">
					{#each data.sources as source (source.id)}
						<div class="flex items-center gap-3 px-4 py-3">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<Badge variant={statusVariant(source.fetchStatus)}>{source.fetchStatus}</Badge>
									<Badge variant="outline">{source.sourceType}</Badge>
								</div>
								<a
									href={source.sourceUrl}
									target="_blank"
									rel="noopener noreferrer external"
									class="mt-1 block truncate text-sm text-muted-foreground hover:underline"
								>
									{source.sourceUrl}
								</a>
							</div>
							<form
								method="POST"
								action="?/retrySource"
								use:enhance={() => {
									return async ({ result, update }) => {
										await update();
										if (result.type === 'success' && result.data?.retried)
											toast.success('Retried.');
									};
								}}
							>
								<input type="hidden" name="sourceId" value={source.id} />
								<Button type="submit" variant="outline" size="sm">
									<RefreshCwIcon class="h-4 w-4" />
									Retry
								</Button>
							</form>
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Danger zone -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Danger Zone</Card.Title>
			<Card.Description>
				Soft-deleted series are hidden from public pages and threads, but links are preserved.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.series.deletedAt}
				<ConfirmButton confirmText="Restore this series?" formAction="?/restore" variant="outline">
					<RotateCcwIcon class="h-4 w-4" />
					Restore
				</ConfirmButton>
			{:else}
				<ConfirmButton
					confirmText="Soft-delete this series?"
					formAction="?/softDelete"
					variant="destructive"
				>
					<Trash2Icon class="h-4 w-4" />
					Soft Delete
				</ConfirmButton>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
