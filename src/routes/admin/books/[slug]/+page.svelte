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
	import GenreMultiPicker from '$lib/components/admin/genre-multi-picker.svelte';
	import ClassificationPicker from '$lib/components/admin/classification-picker.svelte';
	import ClassificationBadges from '$lib/components/classification-badges.svelte';
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
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';

	let { data } = $props();
	let saving = $state(false);

	// Genre multi-picker state
	let selectedGenres = $derived(
		data.genreLinks.map((g) => ({ id: g.genre.id, name: g.genre.name }))
	);

	// Series add state
	let addSeriesId = $state<string | undefined>(undefined);
	let addSeriesMode = $state<'existing' | 'url'>('existing');
	let showAddSeriesForm = $state(false);

	// Session add state
	let addSessionId = $state<string | undefined>(undefined);
	let showAddSessionForm = $state(false);
	let addSessionStatus = $state<'starter' | 'featured' | 'discussed' | 'mentioned_off_theme'>(
		'starter'
	);
	let showAddAccessForm = $state(false);

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
	<title>{pageTitle(`${data.book.title} — Books Admin`)}</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-center gap-2">
		<Button variant="ghost" size="icon-sm" href={resolve('/admin/books')}>
			<ArrowLeftIcon class="h-4 w-4" />
		</Button>
		<Badge variant="secondary">Book</Badge>
		<h1 class="text-2xl font-bold {data.book.deletedAt ? 'line-through' : ''}">
			{data.book.title}
		</h1>
		{#if data.book.deletedAt}
			<Badge variant="outline">deleted</Badge>
		{/if}
		<ClassificationBadges
			classifications={data.allClassifications.filter((classification) =>
				data.assignedClassificationIds.includes(classification.id)
			)}
		/>
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
						<Label for="editionLabel">Edition</Label>
						<Input
							id="editionLabel"
							name="editionLabel"
							placeholder="e.g. 2024 paperback"
							value={data.book.editionLabel ?? ''}
						/>
					</div>
					<div class="space-y-2">
						<Label for="language">Language</Label>
						<Input id="language" name="language" value={data.book.language ?? ''} />
					</div>
					<div class="space-y-2">
						<Label for="pageCount">Page Count</Label>
						<Input
							id="pageCount"
							name="pageCount"
							type="number"
							min="1"
							step="1"
							value={data.book.pageCount ?? ''}
						/>
					</div>
					<div class="space-y-2">
						<Label for="audiobookMinutes">Audiobook Length</Label>
						<Input
							id="audiobookMinutes"
							name="audiobookMinutes"
							type="number"
							min="1"
							step="1"
							placeholder="Minutes"
							value={data.book.audiobookMinutes ?? ''}
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
						<Label for="hardcoverUrl">Hardcover URL</Label>
						<Input
							id="hardcoverUrl"
							name="hardcoverUrl"
							type="url"
							value={data.book.hardcoverUrl ?? ''}
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

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Classifications</Card.Title>
			<Card.Description>
				Cross-genre advisories and labels that can be expanded over time.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/saveClassifications"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						saving = false;
						await update({ reset: false });
						if (result.type === 'success') toast.success('Classifications updated.');
						if (result.type === 'failure') {
							toast.error(String(result.data?.error ?? 'Something went wrong.'));
						}
					};
				}}
				class="space-y-4"
			>
				<ClassificationPicker
					classifications={data.allClassifications}
					selectedIds={data.assignedClassificationIds}
				/>
				<Button type="submit" disabled={saving}>Save classifications</Button>
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
						await update({ reset: false });
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

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Themes</Card.Title>
			<Card.Description>Curated thematic matches for this book.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-3">
			{#if data.themeLinks.length > 0}
				<div class="flex flex-wrap gap-2">
					{#each data.themeLinks as entry (entry.theme.id)}
						<a href={resolve('/admin/themes/[slug]', { slug: entry.theme.slug })}>
							<Badge variant="secondary">{entry.theme.name}</Badge>
						</a>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">No themes linked to this book.</p>
			{/if}
			<Button variant="outline" size="sm" href={resolve('/admin/themes')}>Manage Themes</Button>
		</Card.Content>
	</Card.Root>

	<!-- Availability -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Availability</Card.Title>
			<Card.Description>
				Manual links for libraries, retailers, and subscription services.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4 p-4">
			{#if data.accessOptions.length > 0}
				<div class="space-y-3">
					{#each data.accessOptions as option (option.id)}
						<div class="rounded-lg border p-3">
							<form
								method="POST"
								action="?/updateAccessOption"
								use:enhance={() => {
									saving = true;
									return async ({ result, update }) => {
										saving = false;
										await update({ reset: false });
										if (result.type === 'success') toast.success('Availability updated.');
										if (result.type === 'failure') {
											toast.error(String(result.data?.error ?? 'Unable to update availability.'));
										}
									};
								}}
								class="grid gap-3 md:grid-cols-2"
							>
								<input type="hidden" name="accessOptionId" value={option.id} />
								<div class="space-y-2">
									<Label for="provider-{option.id}">Provider</Label>
									<Input
										id="provider-{option.id}"
										name="providerName"
										value={option.providerName}
										required
									/>
								</div>
								<div class="space-y-2">
									<Label for="provider-type-{option.id}">Provider Type</Label>
									<NativeSelect
										id="provider-type-{option.id}"
										name="providerType"
										value={option.providerType}
										class="w-full"
									>
										<NativeSelectOption value="library">Library</NativeSelectOption>
										<NativeSelectOption value="retailer">Retailer</NativeSelectOption>
										<NativeSelectOption value="subscription">Subscription</NativeSelectOption>
										<NativeSelectOption value="other">Other</NativeSelectOption>
									</NativeSelect>
								</div>
								<div class="space-y-2">
									<Label for="format-{option.id}">Format</Label>
									<NativeSelect
										id="format-{option.id}"
										name="format"
										value={option.format}
										class="w-full"
									>
										<NativeSelectOption value="print">Print</NativeSelectOption>
										<NativeSelectOption value="ebook">Ebook</NativeSelectOption>
										<NativeSelectOption value="audiobook">Audiobook</NativeSelectOption>
										<NativeSelectOption value="other">Other</NativeSelectOption>
									</NativeSelect>
								</div>
								<div class="space-y-2">
									<Label for="access-url-{option.id}">Link</Label>
									<Input
										id="access-url-{option.id}"
										name="url"
										type="url"
										value={option.url ?? ''}
									/>
								</div>
								<div class="space-y-2 md:col-span-2">
									<Label for="access-note-{option.id}">Note</Label>
									<Input id="access-note-{option.id}" name="note" value={option.note ?? ''} />
								</div>
								<div class="flex items-center gap-2 md:col-span-2">
									<Button type="submit" variant="outline" disabled={saving}>Save</Button>
								</div>
							</form>
							<div class="mt-3 border-t pt-3">
								<ConfirmButton
									confirmText="Remove this availability option?"
									formAction="?/removeAccessOption"
									formData={{ accessOptionId: option.id }}
									variant="ghost"
									size="sm"
								>
									<XIcon class="h-4 w-4" />
									Remove
								</ConfirmButton>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">No availability has been recorded.</p>
			{/if}

			{#if showAddAccessForm}
				<form
					method="POST"
					action="?/addAccessOption"
					use:enhance={() => {
						saving = true;
						return async ({ result, update }) => {
							saving = false;
							await update();
							if (result.type === 'success') {
								toast.success('Availability added.');
								showAddAccessForm = false;
							}
							if (result.type === 'failure') {
								toast.error(String(result.data?.error ?? 'Unable to add availability.'));
							}
						};
					}}
					class="grid gap-3 border-t pt-4 md:grid-cols-2"
				>
					<div class="space-y-2">
						<Label for="new-provider">Provider</Label>
						<Input id="new-provider" name="providerName" required />
					</div>
					<div class="space-y-2">
						<Label for="new-provider-type">Provider Type</Label>
						<NativeSelect id="new-provider-type" name="providerType" value="library" class="w-full">
							<NativeSelectOption value="library">Library</NativeSelectOption>
							<NativeSelectOption value="retailer">Retailer</NativeSelectOption>
							<NativeSelectOption value="subscription">Subscription</NativeSelectOption>
							<NativeSelectOption value="other">Other</NativeSelectOption>
						</NativeSelect>
					</div>
					<div class="space-y-2">
						<Label for="new-format">Format</Label>
						<NativeSelect id="new-format" name="format" value="print" class="w-full">
							<NativeSelectOption value="print">Print</NativeSelectOption>
							<NativeSelectOption value="ebook">Ebook</NativeSelectOption>
							<NativeSelectOption value="audiobook">Audiobook</NativeSelectOption>
							<NativeSelectOption value="other">Other</NativeSelectOption>
						</NativeSelect>
					</div>
					<div class="space-y-2">
						<Label for="new-access-url">Link</Label>
						<Input id="new-access-url" name="url" type="url" />
					</div>
					<div class="space-y-2 md:col-span-2">
						<Label for="new-access-note">Note</Label>
						<Input id="new-access-note" name="note" placeholder="Optional access details" />
					</div>
					<div class="flex gap-2 md:col-span-2">
						<Button type="submit" disabled={saving}>Add Availability</Button>
						<Button type="button" variant="ghost" onclick={() => (showAddAccessForm = false)}
							>Cancel</Button
						>
					</div>
				</form>
			{:else}
				<div class="border-t pt-3">
					<Button variant="outline" onclick={() => (showAddAccessForm = true)}>
						<PlusIcon class="h-4 w-4" />
						Add Availability
					</Button>
				</div>
			{/if}
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
						<div class="flex flex-wrap items-center gap-3 px-3 py-2">
							<form
								method="POST"
								action="?/updateSeriesMembership"
								use:enhance={() => {
									saving = true;
									return async ({ result, update }) => {
										saving = false;
										await update({ reset: false });
										if (result.type === 'success') {
											if (result.data?.membershipUpdated) toast.success('Updated.');
											if (result.data?.error) toast.error(String(result.data.error));
										}
									};
								}}
								class="contents"
							>
								<input type="hidden" name="seriesId" value={m.series.id} />
								<a
									class="min-w-40 flex-1 truncate font-medium hover:underline"
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
								</div>
								<Button type="submit" class="h-10" variant="outline" disabled={saving}>Save</Button>
							</form>
							<ConfirmButton
								confirmText="Remove from series?"
								formAction="?/removeFromSeries"
								formData={{ seriesId: m.series.id }}
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
				<p class="text-sm text-muted-foreground">Not currently in any series.</p>
			{/if}

			{#if showAddSeriesForm}
				<div class="border-t pt-3">
					<div class="mb-4 flex items-center justify-between gap-2">
						<div
							class="grid h-10 w-full grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:w-60"
							role="group"
							aria-label="Series source"
						>
							<Button
								size="sm"
								class="h-8"
								variant={addSeriesMode === 'existing' ? 'default' : 'ghost'}
								aria-pressed={addSeriesMode === 'existing'}
								onclick={() => (addSeriesMode = 'existing')}
							>
								Existing
							</Button>
							<Button
								size="sm"
								class="h-8"
								variant={addSeriesMode === 'url' ? 'default' : 'ghost'}
								aria-pressed={addSeriesMode === 'url'}
								onclick={() => (addSeriesMode = 'url')}
							>
								From URL
							</Button>
						</div>
						<Button variant="ghost" size="sm" onclick={() => (showAddSeriesForm = false)}>
							Cancel
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
											showAddSeriesForm = false;
										}
										if (result.data?.error) toast.error(String(result.data.error));
									}
								};
							}}
							class="space-y-4"
						>
							<input type="hidden" name="mode" value="existing" />
							<div class="min-w-0 space-y-2">
								<Label>Series</Label>
								<SeriesPicker
									series={seriesPickerItems}
									bind:selectedId={addSeriesId}
									name="seriesId"
									class="h-10"
									placeholder="Search series to link..."
								/>
							</div>
							<div class="grid gap-4 sm:grid-cols-[10rem_10rem_minmax(0,1fr)] sm:items-end">
								<div class="space-y-2">
									<Label for="add-position">Position</Label>
									<Input id="add-position" name="position" placeholder="e.g. 1" />
								</div>
								<div class="space-y-2">
									<Label for="add-positionSort">Sort</Label>
									<Input
										id="add-positionSort"
										name="positionSort"
										type="number"
										step="0.5"
										placeholder="1"
									/>
								</div>
								<Button
									type="submit"
									class="h-10 w-full sm:w-auto sm:justify-self-end"
									disabled={saving || !addSeriesId}
								>
									<PlusIcon class="h-4 w-4" />
									Add
								</Button>
							</div>
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
										if (result.data?.seriesAdded) {
											toast.success('Added to series.');
											showAddSeriesForm = false;
										}
										if (result.data?.queuedSeries) {
											toast.success(
												'Series URL queued. This book will be linked once it resolves.'
											);
											showAddSeriesForm = false;
										}
										if (result.data?.error) toast.error(String(result.data.error));
									}
								};
							}}
							class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
						>
							<input type="hidden" name="mode" value="url" />
							<div class="min-w-0 space-y-2">
								<Label for="series-url">Goodreads Series URL</Label>
								<Input
									id="series-url"
									name="url"
									type="url"
									placeholder="https://www.goodreads.com/series/..."
									required
								/>
							</div>
							<Button type="submit" class="h-10 w-full md:w-auto" disabled={saving}>
								<LinkIcon class="h-4 w-4" />
								Queue
							</Button>
						</form>
						<p class="mt-2 text-xs text-muted-foreground">
							The book will be auto-linked to the series once the worker resolves it.
						</p>
					{/if}
				</div>
			{:else}
				<div class="border-t pt-3">
					<Button variant="outline" onclick={() => (showAddSeriesForm = true)}>
						<PlusIcon class="h-4 w-4" />
						Add to Series
					</Button>
				</div>
			{/if}
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
						<div class="flex flex-wrap items-center gap-3 px-3 py-2">
							<form
								method="POST"
								action="?/updateSessionLink"
								use:enhance={() => {
									saving = true;
									return async ({ result, update }) => {
										saving = false;
										await update({ reset: false });
										if (result.type === 'success') {
											if (result.data?.sessionLinkUpdated) toast.success('Updated.');
											if (result.data?.error) toast.error(String(result.data.error));
										}
									};
								}}
								class="contents"
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
									<NativeSelect
										id="status-{link.session.id}"
										name="status"
										value={link.link.status}
									>
										<NativeSelectOption value="starter">starter</NativeSelectOption>
										<NativeSelectOption value="featured">featured</NativeSelectOption>
										<NativeSelectOption value="discussed">discussed</NativeSelectOption>
										<NativeSelectOption value="mentioned_off_theme"
											>mentioned off theme</NativeSelectOption
										>
									</NativeSelect>
								</div>
								<Input name="note" class="w-40" placeholder="note" value={link.link.note ?? ''} />
								<Button type="submit" class="h-10" variant="outline" disabled={saving}>Save</Button>
							</form>
							<ConfirmButton
								confirmText="Remove this session link?"
								formAction="?/removeSessionLink"
								formData={{ sessionId: link.session.id }}
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
				<p class="text-sm text-muted-foreground">Not linked to any sessions.</p>
			{/if}

			{#if showAddSessionForm}
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
									showAddSessionForm = false;
								}
								if (result.data?.error) toast.error(String(result.data.error));
							}
						};
					}}
					class="space-y-4 border-t pt-4"
				>
					<div class="flex items-center justify-between gap-2">
						<p class="text-sm font-medium">Link a Session</p>
						<Button variant="ghost" size="sm" onclick={() => (showAddSessionForm = false)}>
							Cancel
						</Button>
					</div>
					<div class="min-w-0 space-y-2">
						<Label>Session</Label>
						<SessionPicker
							sessions={sessionPickerItems}
							bind:selectedId={addSessionId}
							name="sessionId"
							class="h-10"
							placeholder="Search sessions to link..."
						/>
					</div>
					<div class="grid gap-4 md:grid-cols-[10rem_minmax(0,1fr)_auto] md:items-end">
						<div class="space-y-2">
							<Label for="add-status">Status</Label>
							<NativeSelect
								class="w-full"
								id="add-status"
								name="status"
								bind:value={addSessionStatus}
							>
								<NativeSelectOption value="starter">starter</NativeSelectOption>
								<NativeSelectOption value="featured">featured</NativeSelectOption>
								<NativeSelectOption value="discussed">discussed</NativeSelectOption>
								<NativeSelectOption value="mentioned_off_theme"
									>mentioned off theme</NativeSelectOption
								>
							</NativeSelect>
						</div>
						<div class="space-y-2">
							<Label for="add-note">Note</Label>
							<Input id="add-note" name="note" placeholder="Optional context for this session" />
						</div>
						<Button type="submit" class="h-10 w-full md:w-auto" disabled={saving || !addSessionId}>
							<PlusIcon class="h-4 w-4" />
							Link
						</Button>
					</div>
				</form>
			{:else}
				<div class="border-t pt-3">
					<Button variant="outline" onclick={() => (showAddSessionForm = true)}>
						<PlusIcon class="h-4 w-4" />
						Link Session
					</Button>
				</div>
			{/if}
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
