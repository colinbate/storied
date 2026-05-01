<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import BookPicker from '$lib/components/admin/book-picker.svelte';
	import GenreMultiPicker from '$lib/components/admin/genre-multi-picker.svelte';
	import SeriesPicker from '$lib/components/admin/series-picker.svelte';
	import SessionPicker from '$lib/components/admin/session-picker.svelte';
	import ConfirmButton from '$lib/components/confirm-button.svelte';
	import * as NativeSelect from '$lib/components/ui/native-select';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import XIcon from '@lucide/svelte/icons/x';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	let saving = $state(false);
	let addBookId = $state<string | undefined>(undefined);
	let addSeriesId = $state<string | undefined>(undefined);
	let addSessionId = $state<string | undefined>(undefined);
	let addSessionStatus = $state<'starter' | 'featured' | 'discussed' | 'mentioned_off_theme'>(
		'starter'
	);

	const selectedGenres = $derived(
		data.genreLinks.map((g) => ({ id: g.genre.id, name: g.genre.name }))
	);
	const genrePickerItems = $derived(data.allGenres.map((g) => ({ id: g.id, name: g.name })));
	const sessionPickerItems = $derived(
		data.allSessions
			.filter((s) => !data.sessionLinks.some((l) => l.session.id === s.id))
			.map((s) => ({ id: s.id, title: s.title, theme: s.theme }))
	);
	const bookPickerItems = $derived(
		data.allBooks
			.filter((book) => !book.deletedAt)
			.filter((book) => !data.bookLinks.some((entry) => entry.book.id === book.id))
			.map((book) => ({ id: book.id, title: book.title, authorText: book.authorText }))
	);
	const seriesPickerItems = $derived(
		data.allSeries
			.filter((item) => !item.deletedAt)
			.filter((item) => !data.seriesLinks.some((entry) => entry.series.id === item.id))
			.map((item) => ({ id: item.id, title: item.title, authorText: item.authorText }))
	);

	function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
		if (status === 'resolved') return 'default';
		if (status === 'pending') return 'secondary';
		if (status === 'failed') return 'destructive';
		return 'outline';
	}
</script>

<svelte:head>
	<title>{data.author.name} — Authors Admin — The Archive</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-2">
		<Button variant="ghost" size="icon-sm" href={resolve('/admin/authors')}>
			<ArrowLeftIcon class="h-4 w-4" />
		</Button>
		<h1 class="text-2xl font-bold {data.author.deletedAt ? 'line-through' : ''}">
			{data.author.name}
		</h1>
		{#if data.author.deletedAt}
			<Badge variant="outline">deleted</Badge>
		{/if}
		{#if !data.author.deletedAt}
			<Button
				variant="outline"
				size="sm"
				href={resolve('/authors/[slug]', { slug: data.author.slug })}
				class="ml-auto"
			>
				View Public Page
			</Button>
		{/if}
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Metadata</Card.Title>
			<Card.Description>Slug: <span class="font-mono">{data.author.slug}</span></Card.Description>
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
						if (result.type === 'success' && result.data?.updated) toast.success('Author updated.');
						if (result.type === 'failure') {
							toast.error(String(result.data?.error ?? 'Something went wrong.'));
						}
					};
				}}
				class="space-y-4"
			>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2 sm:col-span-2">
						<Label for="name">Name</Label>
						<Input id="name" name="name" value={data.author.name} required />
					</div>
					<div class="space-y-2">
						<Label for="photoUrl">Photo URL</Label>
						<Input id="photoUrl" name="photoUrl" type="url" value={data.author.photoUrl ?? ''} />
						{#if data.author.photoUrl}
							<img
								src={data.author.photoUrl}
								alt={data.author.name}
								class="mt-2 h-24 w-24 rounded object-cover"
							/>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="websiteUrl">Website URL</Label>
						<Input
							id="websiteUrl"
							name="websiteUrl"
							type="url"
							value={data.author.websiteUrl ?? ''}
						/>
					</div>
					<div class="space-y-2">
						<Label for="goodreadsUrl">Goodreads URL</Label>
						<Input
							id="goodreadsUrl"
							name="goodreadsUrl"
							type="url"
							value={data.author.goodreadsUrl ?? ''}
						/>
					</div>
					<div class="space-y-2">
						<Label for="openLibraryId">Open Library ID</Label>
						<Input
							id="openLibraryId"
							name="openLibraryId"
							value={data.author.openLibraryId ?? ''}
						/>
					</div>
					<div class="space-y-2 sm:col-span-2">
						<Label for="bio">Bio</Label>
						<Textarea id="bio" name="bio" rows={5} value={data.author.bio ?? ''} />
					</div>
				</div>
				<Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Metadata'}</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Genres</Card.Title>
			<Card.Description>Manual genre assignments for this author.</Card.Description>
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
						if (result.type === 'success' && result.data?.genresUpdated)
							toast.success('Genres updated.');
					};
				}}
				class="space-y-3"
			>
				<GenreMultiPicker genres={genrePickerItems} {selectedGenres} name="genreIds" />
				<Button type="submit" disabled={saving}>Save Genres</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<div class="flex items-center gap-2">
					<BookOpenIcon class="h-5 w-5 text-primary" />
					<Card.Title class="text-base">Books ({data.bookLinks.length})</Card.Title>
				</div>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="space-y-2">
					{#each data.bookLinks as entry (entry.book.id)}
						<div class="flex items-center gap-2 rounded-md p-2 hover:bg-muted">
							<a
								href={resolve('/admin/books/[slug]', { slug: entry.book.slug })}
								class="flex min-w-0 flex-1 items-center gap-3"
							>
								{#if entry.book.coverUrl}
									<img
										src={entry.book.coverUrl}
										alt=""
										class="h-12 w-8 shrink-0 rounded object-cover"
									/>
								{:else}
									<span class="flex h-12 w-8 shrink-0 items-center justify-center rounded bg-muted">
										<BookOpenIcon class="h-4 w-4 text-muted-foreground" />
									</span>
								{/if}
								<span class="min-w-0">
									<span class="block truncate font-medium">{entry.book.title}</span>
									{#if entry.book.authorText}
										<span class="block truncate text-xs text-muted-foreground"
											>{entry.book.authorText}</span
										>
									{/if}
								</span>
							</a>
							<ConfirmButton
								confirmText="Remove this book link?"
								formAction="?/removeBookLink"
								formData={{ bookId: entry.book.id }}
								variant="ghost"
								size="icon-sm"
								enhance={() => {
									return async ({ result, update }) => {
										await update();
										if (result.type === 'success' && result.data?.bookLinkRemoved) {
											toast.success('Book link removed.');
										}
									};
								}}
							>
								<XIcon class="h-4 w-4" />
							</ConfirmButton>
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">No books linked yet.</p>
					{/each}
				</div>

				<form
					method="POST"
					action="?/addBookLink"
					use:enhance={() => {
						saving = true;
						return async ({ result, update }) => {
							saving = false;
							await update();
							if (result.type === 'success' && result.data?.bookLinkAdded) {
								toast.success('Book linked.');
								addBookId = undefined;
							}
							if (result.type === 'failure') {
								toast.error(String(result.data?.error ?? 'Something went wrong.'));
							}
						};
					}}
					class="flex flex-wrap items-end gap-2 border-t pt-3"
				>
					<div class="min-w-0 flex-1 space-y-1">
						<Label class="mb-2">Book</Label>
						<BookPicker
							books={bookPickerItems}
							bind:selectedId={addBookId}
							name="bookId"
							class="mb-0 h-10"
							placeholder="Search books to link..."
						/>
					</div>
					<Button type="submit" class="h-10" disabled={saving || !addBookId}>
						<PlusIcon class="h-4 w-4" />
						Link
					</Button>
				</form>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<div class="flex items-center gap-2">
					<LibraryIcon class="h-5 w-5 text-primary" />
					<Card.Title class="text-base">Series ({data.seriesLinks.length})</Card.Title>
				</div>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="space-y-2">
					{#each data.seriesLinks as entry (entry.series.id)}
						<div class="flex items-center gap-2 rounded-md p-2 hover:bg-muted">
							<a
								href={resolve('/admin/series/[slug]', { slug: entry.series.slug })}
								class="flex min-w-0 flex-1 items-center gap-3"
							>
								{#if entry.series.coverUrl}
									<img
										src={entry.series.coverUrl}
										alt=""
										class="h-12 w-8 shrink-0 rounded object-cover"
									/>
								{:else}
									<span class="flex h-12 w-8 shrink-0 items-center justify-center rounded bg-muted">
										<LibraryIcon class="h-4 w-4 text-muted-foreground" />
									</span>
								{/if}
								<span class="min-w-0">
									<span class="block truncate font-medium">{entry.series.title}</span>
									{#if entry.series.authorText}
										<span class="block truncate text-xs text-muted-foreground"
											>{entry.series.authorText}</span
										>
									{/if}
								</span>
							</a>
							<ConfirmButton
								confirmText="Remove this series link?"
								formAction="?/removeSeriesLink"
								formData={{ seriesId: entry.series.id }}
								variant="ghost"
								size="icon-sm"
								enhance={() => {
									return async ({ result, update }) => {
										await update();
										if (result.type === 'success' && result.data?.seriesLinkRemoved) {
											toast.success('Series link removed.');
										}
									};
								}}
							>
								<XIcon class="h-4 w-4" />
							</ConfirmButton>
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">No series linked yet.</p>
					{/each}
				</div>

				<form
					method="POST"
					action="?/addSeriesLink"
					use:enhance={() => {
						saving = true;
						return async ({ result, update }) => {
							saving = false;
							await update();
							if (result.type === 'success' && result.data?.seriesLinkAdded) {
								toast.success('Series linked.');
								addSeriesId = undefined;
							}
							if (result.type === 'failure') {
								toast.error(String(result.data?.error ?? 'Something went wrong.'));
							}
						};
					}}
					class="flex flex-wrap items-end gap-2 border-t pt-3"
				>
					<div class="min-w-0 flex-1 space-y-1">
						<Label class="mb-2">Series</Label>
						<SeriesPicker
							series={seriesPickerItems}
							bind:selectedId={addSeriesId}
							name="seriesId"
							class="mb-0 h-10"
							placeholder="Search series to link..."
						/>
					</div>
					<Button type="submit" class="h-10" disabled={saving || !addSeriesId}>
						<PlusIcon class="h-4 w-4" />
						Link
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Sessions</Card.Title>
			<Card.Description>Sessions where this author has been discussed or featured.</Card.Description
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
									await update({ reset: false });
									if (result.type === 'success' && result.data?.sessionLinkUpdated)
										toast.success('Updated.');
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
						if (result.type === 'success' && result.data?.sessionLinkAdded) {
							toast.success('Linked to session.');
							addSessionId = undefined;
						}
					};
				}}
				class="flex flex-wrap items-end gap-2 border-t pt-3"
			>
				<div class="min-w-0 flex-1 space-y-1">
					<Label class="mb-2">Session</Label>
					<SessionPicker
						sessions={sessionPickerItems}
						bind:selectedId={addSessionId}
						name="sessionId"
						class="mb-0 h-10"
					/>
				</div>
				<div class="space-y-1">
					<Label for="add-status" class="mb-2">Status</Label>
					<NativeSelect.Root
						id="add-status"
						name="status"
						class="h-10"
						bind:value={addSessionStatus}
					>
						<NativeSelect.Option value="starter">starter</NativeSelect.Option>
						<NativeSelect.Option value="featured">featured</NativeSelect.Option>
						<NativeSelect.Option value="discussed">discussed</NativeSelect.Option>
						<NativeSelect.Option value="mentioned_off_theme"
							>mentioned off theme</NativeSelect.Option
						>
					</NativeSelect.Root>
				</div>
				<div class="flex-1 space-y-1">
					<Label for="add-note" class="mb-2">Note</Label>
					<Input id="add-note" name="note" placeholder="optional" />
				</div>
				<Button type="submit" class="h-10" disabled={saving || !addSessionId}>
					<PlusIcon class="h-4 w-4" />
					Link
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	{#if data.sources.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">External Sources</Card.Title>
				<Card.Description>External references that resolved to this author.</Card.Description>
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

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Danger Zone</Card.Title>
			<Card.Description>
				Soft-deleted authors are hidden from public pages and threads, but links are preserved.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.author.deletedAt}
				<ConfirmButton confirmText="Restore this author?" formAction="?/restore" variant="outline">
					<RotateCcwIcon class="h-4 w-4" />
					Restore
				</ConfirmButton>
			{:else}
				<ConfirmButton
					confirmText="Soft-delete this author?"
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
