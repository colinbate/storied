<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import BookPicker from '$lib/components/admin/book-picker.svelte';
	import SeriesPicker from '$lib/components/admin/series-picker.svelte';
	import ConfirmButton from '$lib/components/confirm-button.svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import LinkIcon from '@lucide/svelte/icons/link';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	let saving = $state(false);

	type LinkKind = 'book' | 'series';
	let addKind = $state<LinkKind>('book');
	let addBookId = $state<string | undefined>(undefined);
	let addSeriesId = $state<string | undefined>(undefined);
	let addStatus = $state<'mentioned' | 'featured' | 'selected'>('mentioned');

	let urlStatus = $state<'mentioned' | 'featured' | 'selected'>('mentioned');

	const bookPickerItems = $derived(
		data.allBooks
			.filter((b) => !b.deletedAt)
			.filter(
				(b) => !data.linkedSubjects.some((s) => s.kind === 'book' && s.book.id === b.id)
			)
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
</script>

<svelte:head>
	<title>{data.session.title} — Session Admin — Storied</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-2">
		<Button variant="ghost" size="icon-sm" href={resolve('/admin/sessions')}>
			<ArrowLeftIcon class="h-4 w-4" />
		</Button>
		<h1 class="text-2xl font-bold">{data.session.title}</h1>
		{#if data.session.theme}
			<Badge variant="secondary">{data.session.theme}</Badge>
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
						<Label for="theme">Theme</Label>
						<Input id="theme" name="theme" value={data.session.theme ?? ''} />
					</div>
					<div class="space-y-2">
						<Label for="startsAt">Starts At</Label>
						<Input
							id="startsAt"
							name="startsAt"
							type="date"
							value={data.session.startsAt ?? ''}
						/>
					</div>
					<div class="space-y-2">
						<Label for="astroPath">Astro Path</Label>
						<Input id="astroPath" name="astroPath" value={data.session.astroPath ?? ''} />
					</div>
					<div class="space-y-2 sm:col-span-2">
						<Label for="externalUrl">External URL</Label>
						<Input
							id="externalUrl"
							name="externalUrl"
							type="url"
							value={data.session.externalUrl ?? ''}
						/>
					</div>
				</div>
				<Button type="submit" disabled={saving}>
					{saving ? 'Saving…' : 'Save Session'}
				</Button>
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
							class="flex flex-wrap items-center gap-3 px-4 py-3 {entry.book.deletedAt ? 'opacity-60' : ''}"
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
								class="min-w-[10rem] flex-1 truncate font-medium hover:underline {entry.book.deletedAt ? 'line-through' : ''}"
								href={resolve('/admin/books/[slug]', { slug: entry.book.slug })}
							>
								{entry.book.title}
								{#if entry.book.authorText}
									<span class="font-normal text-muted-foreground"> — {entry.book.authorText}</span>
								{/if}
							</a>
							<div class="flex items-center gap-2">
								<Label for="status-b-{entry.book.id}" class="text-xs">Status</Label>
								<select
									id="status-b-{entry.book.id}"
									name="status"
									value={entry.link.status}
									class="h-8 rounded border bg-background px-2 text-sm"
								>
									<option value="mentioned">mentioned</option>
									<option value="featured">featured</option>
									<option value="selected">selected</option>
								</select>
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
							class="flex flex-wrap items-center gap-3 px-4 py-3 {entry.series.deletedAt ? 'opacity-60' : ''}"
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
								class="min-w-[10rem] flex-1 truncate font-medium hover:underline {entry.series.deletedAt ? 'line-through' : ''}"
								href={resolve('/admin/series/[slug]', { slug: entry.series.slug })}
							>
								{entry.series.title}
								{#if entry.series.authorText}
									<span class="font-normal text-muted-foreground"> — {entry.series.authorText}</span>
								{/if}
							</a>
							<div class="flex items-center gap-2">
								<Label for="status-s-{entry.series.id}" class="text-xs">Status</Label>
								<select
									id="status-s-{entry.series.id}"
									name="status"
									value={entry.link.status}
									class="h-8 rounded border bg-background px-2 text-sm"
								>
									<option value="mentioned">mentioned</option>
									<option value="featured">featured</option>
									<option value="selected">selected</option>
								</select>
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
					<select
						id="add-status"
						name="status"
						bind:value={addStatus}
						class="h-9 rounded border bg-background px-2 text-sm"
					>
						<option value="mentioned">mentioned</option>
						<option value="featured">featured</option>
						<option value="selected">selected</option>
					</select>
				</div>
				<div class="flex-1 space-y-1">
					<Label for="add-note">Note</Label>
					<Input id="add-note" name="note" placeholder="optional" />
				</div>
				<Button
					type="submit"
					disabled={saving || (addKind === 'book' ? !addBookId : !addSeriesId)}
				>
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
								toast.success("Queued. Will link to session once resolved.");
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
					<select
						id="url-status"
						name="status"
						bind:value={urlStatus}
						class="h-9 rounded border bg-background px-2 text-sm"
					>
						<option value="mentioned">mentioned</option>
						<option value="featured">featured</option>
						<option value="selected">selected</option>
					</select>
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
