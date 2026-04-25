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
	import SeriesPicker from '$lib/components/admin/series-picker.svelte';
	import SessionPicker from '$lib/components/admin/session-picker.svelte';
	import ConfirmButton from '$lib/components/confirm-button.svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import LinkIcon from '@lucide/svelte/icons/link';
	import { toast } from 'svelte-sonner';
	import * as NativeSelect from '$lib/components/ui/native-select';

	let { data } = $props();
	let saving = $state(false);

	// Genre multi-picker state
	let selectedGenres = $derived(
		data.genreLinks.map((g) => ({ id: g.genre.id, name: g.genre.name }))
	);

	// Series add state
	let addSeriesId = $state<string | undefined>(undefined);
	let addSeriesMode = $state<'existing' | 'url'>('existing');

	// Session add state
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
	const seriesPickerItems = $derived(
		data.allSeries
			.filter((s) => !s.deletedAt)
			.filter((s) => !data.seriesMemberships.some((m) => m.series.id === s.id))
			.map((s) => ({ id: s.id, title: s.title, authorText: s.authorText }))
	);
	const sessionPickerItems = $derived(
		data.allSessions
			.filter((s) => !data.sessionLinks.some((l) => l.session.id === s.id))
			.map((s) => ({ id: s.id, title: s.title, theme: s.theme }))
	);
</script>

<svelte:head>
	<title>{data.book.title} — Books Admin — The Archive</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-2">
		<Button variant="ghost" size="icon-sm" href={resolve('/admin/books')}>
			<ArrowLeftIcon class="h-4 w-4" />
		</Button>
		<h1 class="text-2xl font-bold {data.book.deletedAt ? 'line-through' : ''}">
			{data.book.title}
		</h1>
		{#if data.book.deletedAt}
			<Badge variant="outline">deleted</Badge>
		{/if}
		{#if !data.book.deletedAt}
			<Button
				variant="outline"
				size="sm"
				href={resolve('/books/[slug]', { slug: data.book.slug })}
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
			<Card.Description>Slug: <span class="font-mono">{data.book.slug}</span></Card.Description>
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
							if (result.data?.updated) toast.success('Book updated.');
							if (result.data?.error) toast.error(String(result.data.error));
						} else if (result.type === 'failure') {
							toast.error(String(result.data?.error ?? 'Something went wrong.'));
						}
					};
				}}
				class="space-y-4"
			>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2 sm:col-span-2">
						<Label for="title">Title</Label>
						<Input id="title" name="title" value={data.book.title} required />
					</div>
					<div class="space-y-2">
						<Label for="subtitle">Subtitle</Label>
						<Input id="subtitle" name="subtitle" value={data.book.subtitle ?? ''} />
					</div>
					<div class="space-y-2">
						<Label for="authorText">Author</Label>
						<Input id="authorText" name="authorText" value={data.book.authorText ?? ''} />
					</div>
					<div class="space-y-2 sm:col-span-2">
						<Label for="coverUrl">Cover URL</Label>
						<Input id="coverUrl" name="coverUrl" type="url" value={data.book.coverUrl ?? ''} />
						{#if data.book.coverUrl}
							<img
								src={data.book.coverUrl}
								alt="Cover of {data.book.title}"
								class="mt-2 h-24 w-16 rounded object-cover"
							/>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="isbn13">ISBN-13</Label>
						<Input id="isbn13" name="isbn13" value={data.book.isbn13 ?? ''} />
					</div>
					<div class="space-y-2">
						<Label for="firstPublishYear">First Publish Year</Label>
						<Input
							id="firstPublishYear"
							name="firstPublishYear"
							type="number"
							min="0"
							max="9999"
							value={data.book.firstPublishYear ?? ''}
						/>
					</div>
					<div class="space-y-2">
						<Label for="amazonAsin">Amazon ASIN</Label>
						<Input id="amazonAsin" name="amazonAsin" value={data.book.amazonAsin ?? ''} />
					</div>
					<div class="space-y-2">
						<Label for="goodreadsUrl">Goodreads URL</Label>
						<Input
							id="goodreadsUrl"
							name="goodreadsUrl"
							type="url"
							value={data.book.goodreadsUrl ?? ''}
						/>
					</div>
					<div class="space-y-2">
						<Label for="openLibraryId">Open Library ID</Label>
						<Input id="openLibraryId" name="openLibraryId" value={data.book.openLibraryId ?? ''} />
					</div>
					<div class="space-y-2">
						<Label for="googleBooksId">Google Books ID</Label>
						<Input id="googleBooksId" name="googleBooksId" value={data.book.googleBooksId ?? ''} />
					</div>
					<div class="space-y-2 sm:col-span-2">
						<Label for="description">Description</Label>
						<Textarea
							id="description"
							name="description"
							rows={5}
							value={data.book.description ?? ''}
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
			<Card.Description>Manual genre assignments for this book.</Card.Description>
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
				<Button type="submit" disabled={saving}>Save Genres</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Series memberships -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Series</Card.Title>
			<Card.Description>Series this book is part of.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4 p-4">
			{#if data.seriesMemberships.length > 0}
				<div class="divide-y rounded border">
					{#each data.seriesMemberships as m (m.series.id)}
						<form
							method="POST"
							action="?/updateSeriesMembership"
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
							class="flex items-center gap-3 px-3 py-2"
						>
							<input type="hidden" name="seriesId" value={m.series.id} />
							<a
								class="min-w-0 flex-1 font-medium hover:underline"
								href={resolve('/admin/series/[slug]', { slug: m.series.slug })}
							>
								{m.series.title}
							</a>
							<div class="flex items-center gap-2">
								<Label for="position-{m.series.id}" class="text-xs">Position</Label>
								<Input
									id="position-{m.series.id}"
									name="position"
									class="w-20"
									value={m.link.position ?? ''}
								/>
								<Label for="positionSort-{m.series.id}" class="text-xs">Sort</Label>
								<Input
									id="positionSort-{m.series.id}"
									name="positionSort"
									type="number"
									step="0.5"
									class="w-20"
									value={m.link.positionSort ?? ''}
								/>
								<Button type="submit" size="sm" variant="outline" disabled={saving}>Save</Button>
							</div>
							<ConfirmButton
								confirmText="Remove from series?"
								formAction="?/removeFromSeries"
								formData={{ seriesId: m.series.id }}
								variant="ghost"
								size="icon-sm"
							>
								<XIcon class="h-4 w-4" />
							</ConfirmButton>
						</form>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">Not currently in any series.</p>
			{/if}

			<div class="border-t pt-3">
				<div class="mb-2 flex items-center gap-2 text-sm">
					<Button
						size="sm"
						variant={addSeriesMode === 'existing' ? 'default' : 'outline'}
						onclick={() => (addSeriesMode = 'existing')}
					>
						Existing
					</Button>
					<Button
						size="sm"
						variant={addSeriesMode === 'url' ? 'default' : 'outline'}
						onclick={() => (addSeriesMode = 'url')}
					>
						From URL
					</Button>
				</div>

				{#if addSeriesMode === 'existing'}
					<form
						method="POST"
						action="?/addToSeries"
						use:enhance={() => {
							saving = true;
							return async ({ result, update }) => {
								saving = false;
								await update();
								if (result.type === 'success') {
									if (result.data?.seriesAdded) {
										toast.success('Added to series.');
										addSeriesId = undefined;
									}
									if (result.data?.error) toast.error(String(result.data.error));
								}
							};
						}}
						class="flex flex-wrap items-end gap-2"
					>
						<input type="hidden" name="mode" value="existing" />
						<div class="min-w-0 flex-1 space-y-1">
							<Label>Series</Label>
							<SeriesPicker
								series={seriesPickerItems}
								bind:selectedId={addSeriesId}
								name="seriesId"
							/>
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
						<Button type="submit" disabled={saving || !addSeriesId}>
							<PlusIcon class="h-4 w-4" />
							Add
						</Button>
					</form>
				{:else}
					<form
						method="POST"
						action="?/addToSeries"
						use:enhance={() => {
							saving = true;
							return async ({ result, update }) => {
								saving = false;
								await update();
								if (result.type === 'success') {
									if (result.data?.seriesAdded) toast.success('Added to series.');
									if (result.data?.queuedSeries)
										toast.success('Series URL queued. This book will be linked once it resolves.');
									if (result.data?.error) toast.error(String(result.data.error));
								}
							};
						}}
						class="flex flex-wrap items-end gap-2"
					>
						<input type="hidden" name="mode" value="url" />
						<div class="min-w-0 flex-1 space-y-1">
							<Label for="series-url">Goodreads Series URL</Label>
							<Input
								id="series-url"
								name="url"
								type="url"
								placeholder="https://www.goodreads.com/series/..."
								required
							/>
						</div>
						<Button type="submit" disabled={saving}>
							<LinkIcon class="h-4 w-4" />
							Queue
						</Button>
					</form>
					<p class="mt-2 text-xs text-muted-foreground">
						The book will be auto-linked to the series once the worker resolves it.
					</p>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Session links -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Sessions</Card.Title>
			<Card.Description>Sessions where this book has been discussed or featured.</Card.Description>
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
								<NativeSelect.Root
									id="status-{link.session.id}"
									name="status"
									value={link.link.status}
								>
									<NativeSelect.Option value="starter">starter</NativeSelect.Option>
									<NativeSelect.Option value="featured">featured</NativeSelect.Option>
									<NativeSelect.Option value="discussed">discussed</NativeSelect.Option>
									<NativeSelect.Option value="mentioned_off_theme"
										>mentioned off theme</NativeSelect.Option
									>
								</NativeSelect.Root>
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
					<NativeSelect.Root id="add-status" name="status" bind:value={addSessionStatus}>
						<NativeSelect.Option value="starter">starter</NativeSelect.Option>
						<NativeSelect.Option value="featured">featured</NativeSelect.Option>
						<NativeSelect.Option value="discussed">discussed</NativeSelect.Option>
						<NativeSelect.Option value="mentioned_off_theme"
							>mentioned off theme</NativeSelect.Option
						>
					</NativeSelect.Root>
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
				<Card.Description>External references that resolved to this book.</Card.Description>
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
				Soft-deleted books are hidden from public pages and threads, but links are preserved.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.book.deletedAt}
				<ConfirmButton confirmText="Restore this book?" formAction="?/restore" variant="outline">
					<RotateCcwIcon class="h-4 w-4" />
					Restore
				</ConfirmButton>
			{:else}
				<ConfirmButton
					confirmText="Soft-delete this book?"
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
