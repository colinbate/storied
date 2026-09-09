<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { pageTitle } from '$shared/brand';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import BookPicker from '$lib/components/admin/book-picker.svelte';
	import ConfirmButton from '$lib/components/confirm-button.svelte';
	import MarkdownHint from '$lib/components/markdown-hint.svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import { toast } from 'svelte-sonner';

	let { data, form } = $props();
	let saving = $state(false);
	let addBookId = $state<string | undefined>(undefined);
	let addBookUrl = $state<string | null>(null);
	const statuses = ['idea', 'shortlist', 'selected', 'archived'] as const;
	const availableBooks = $derived(
		data.books.filter((book) => !data.linkedBooks.some((entry) => entry.book.id === book.id))
	);
</script>

<svelte:head>
	<title>{pageTitle(`${data.theme.name} · Theme Admin`)}</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-center gap-2">
		<Button variant="ghost" size="icon-sm" href={resolve('/admin/themes')}>
			<ArrowLeftIcon class="h-4 w-4" />
		</Button>
		<h1 class="text-2xl font-bold">{data.theme.name}</h1>
		<Badge variant="secondary">{data.theme.status}</Badge>
		<Button
			variant="outline"
			size="sm"
			href={resolve('/themes/[slug]', { slug: data.theme.slug })}
			class="ml-auto"
		>
			<EyeIcon class="h-4 w-4" />
			Member View
		</Button>
	</div>

	{#if form?.error}
		<div class="rounded border border-destructive p-3 text-destructive">{form.error}</div>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Theme Content</Card.Title>
			<Card.Description>
				The description is the short pitch. The guide supplies the full theme content used by
				sessions.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/update"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						saving = false;
						await update({ reset: false });
						if (result.type === 'success' && result.data?.updated) toast.success('Theme saved.');
						if (result.type === 'failure')
							toast.error(String(result.data?.error ?? 'Unable to save theme.'));
					};
				}}
				class="space-y-5"
			>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="name">Name</Label>
						<Input id="name" name="name" value={data.theme.name} required />
					</div>
					<div class="space-y-2">
						<Label for="status">Status</Label>
						<NativeSelect id="status" name="status" value={data.theme.status}>
							{#each statuses as status (status)}
								<NativeSelectOption value={status}>{status}</NativeSelectOption>
							{/each}
						</NativeSelect>
					</div>
					<div class="space-y-2 sm:col-span-2">
						<Label for="description">Description</Label>
						<Input
							id="description"
							name="description"
							value={data.theme.description ?? ''}
							placeholder="A concise pitch for the theme"
						/>
					</div>
					<div class="space-y-2 sm:col-span-2">
						<Label for="guideSource">Guide</Label>
						<Textarea
							id="guideSource"
							name="guideSource"
							rows={14}
							value={data.theme.guideSource ?? ''}
							placeholder="Explain the boundaries, sub-themes, and kinds of books that fit."
						/>
						<MarkdownHint />
					</div>
					<div class="space-y-2 sm:col-span-2">
						<Label for="exampleText">Submitted Examples</Label>
						<Textarea
							id="exampleText"
							name="exampleText"
							rows={3}
							value={data.theme.exampleText ?? ''}
						/>
						<p class="text-xs text-muted-foreground">
							Free-form examples supplied with the original suggestion.
						</p>
					</div>
				</div>
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div class="flex flex-wrap gap-3 text-xs text-muted-foreground">
						<span class="font-mono">{data.theme.slug}</span>
						{#if data.submitter}<span>Submitted by {data.submitter.displayName}</span>{/if}
					</div>
					<Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Theme'}</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Books ({data.linkedBooks.length})</Card.Title>
			<Card.Description>
				Curated matches can be promoted to starter books when this theme is used.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if data.linkedBooks.length > 0}
				<div class="divide-y rounded-md border">
					{#each data.linkedBooks as entry (entry.book.id)}
						<div class="flex items-center gap-3 px-3 py-2">
							{#if entry.book.coverUrl}
								<img src={entry.book.coverUrl} alt="" class="h-12 w-8 rounded object-cover" />
							{:else}
								<div class="flex h-12 w-8 items-center justify-center rounded bg-muted">
									<BookOpenIcon class="h-4 w-4 text-muted-foreground" />
								</div>
							{/if}
							<a
								class="min-w-0 flex-1 hover:underline"
								href={resolve('/admin/books/[slug]', { slug: entry.book.slug })}
							>
								<span class="block truncate font-medium">{entry.book.title}</span>
								{#if entry.book.authorText}
									<span class="block truncate text-sm text-muted-foreground"
										>{entry.book.authorText}</span
									>
								{/if}
							</a>
							<ConfirmButton
								confirmText="Remove this book from the theme?"
								formAction="?/removeBook"
								formData={{ bookId: entry.book.id }}
								variant="ghost"
								size="icon-sm"
								title="Remove book"
							>
								<XIcon class="h-4 w-4" />
							</ConfirmButton>
						</div>
					{/each}
				</div>
			{:else}
				<p class="rounded-md border px-3 py-4 text-sm text-muted-foreground">
					No books linked to this theme yet.
				</p>
			{/if}

			<form
				method="POST"
				action="?/addBook"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						saving = false;
						await update();
						if (result.type === 'success') {
							if (result.data?.themeBookAdded) toast.success('Book linked to theme.');
							if (result.data?.themeBookQueued)
								toast.success('Book queued and will be linked after import.');
							addBookId = undefined;
							addBookUrl = null;
						}
						if (result.type === 'failure')
							toast.error(String(result.data?.error ?? 'Unable to add book.'));
					};
				}}
				class="space-y-3"
			>
				<BookPicker
					books={availableBooks}
					bind:selectedId={addBookId}
					bind:selectedUrl={addBookUrl}
					name="bookId"
					urlName="url"
					allowUrl
					placeholder="Search the library or enter a book URL..."
				/>
				<Button type="submit" size="sm" disabled={saving || (!addBookId && !addBookUrl)}>
					<PlusIcon class="h-4 w-4" />
					Add Book
				</Button>
			</form>

			{#if data.sessions.length > 0}
				<form
					method="POST"
					action="?/backfillBooks"
					use:enhance={() => {
						saving = true;
						return async ({ result, update }) => {
							saving = false;
							await update({ reset: false });
							if (result.type === 'success' && result.data?.themeBooksBackfilled) {
								const count = Number(result.data.addedCount ?? 0);
								toast.success(
									count === 0
										? 'All eligible session books are already linked.'
										: `${count} session ${count === 1 ? 'book' : 'books'} linked to theme.`
								);
							}
						};
					}}
				>
					<Button type="submit" size="sm" variant="outline" disabled={saving}>
						Add Starter and Featured Books from Sessions
					</Button>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if data.sessions.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Sessions ({data.sessions.length})</Card.Title>
			</Card.Header>
			<Card.Content class="divide-y p-0">
				{#each data.sessions as session (session.id)}
					<a
						href={resolve('/admin/sessions/[slug]', { slug: session.slug })}
						class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
					>
						<span class="font-medium">{session.title}</span>
						<Badge variant="outline">{session.status}</Badge>
					</a>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
