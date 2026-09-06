<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import BookPicker from '$lib/components/admin/book-picker.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import * as NativeSelect from '$lib/components/ui/native-select';
	import { toast } from 'svelte-sonner';

	type BookItem = {
		id: string;
		title: string;
		authorText?: string | null;
	};

	type ExistingChoice = {
		bookId: string;
		readingStatus: string;
	};

	type Props = {
		open?: boolean;
		books: BookItem[];
		choice?: ExistingChoice | null;
	};

	let { open = $bindable(false), books, choice = null }: Props = $props();
	let selectedBookId = $derived(choice?.bookId);
	let selectedBookUrl = $state<string | null>(null);
	let readingStatus = $derived(choice?.readingStatus ?? 'planned');
	let saving = $state(false);

	const saveChoice: SubmitFunction = () => {
		saving = true;
		return async ({ result, update }) => {
			saving = false;
			await update({ reset: false });
			if (result.type === 'success') {
				if (result.data?.readingChoiceSaved) toast.success('Reading choice saved.');
				else if (result.data?.readingChoiceQueued)
					toast.success('The book is being added from the URL.');
				if (result.data?.readingChoiceSaved || result.data?.readingChoiceQueued) open = false;
			} else if (result.type === 'failure' && result.data?.readingChoiceError) {
				toast.error(String(result.data.readingChoiceError));
			}
		};
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title>{choice ? 'Edit Your Reading' : 'Add Your Reading'}</Dialog.Title>
			<Dialog.Description>
				Choose the book you plan to read for this session. This is visible to signed-in club members
				and does not change your RSVP.
			</Dialog.Description>
		</Dialog.Header>

		<form method="POST" action="?/upsertReadingChoice" use:enhance={saveChoice} class="space-y-4">
			{#if choice}
				<input type="hidden" name="previousBookId" value={choice.bookId} />
			{/if}
			<div class="space-y-2">
				<Label>Book</Label>
				<BookPicker
					{books}
					bind:selectedId={selectedBookId}
					bind:selectedUrl={selectedBookUrl}
					name="bookId"
					urlName="url"
					allowUrl
					placeholder="Search the club library or enter a URL..."
				/>
			</div>
			<div class="space-y-2">
				<Label for="session-reading-status">Reading Status</Label>
				<NativeSelect.Root
					id="session-reading-status"
					name="readingStatus"
					bind:value={readingStatus}
					class="w-full"
				>
					<NativeSelect.Option value="considering">Considering</NativeSelect.Option>
					<NativeSelect.Option value="planned">Planning to read</NativeSelect.Option>
					<NativeSelect.Option value="reading">Reading</NativeSelect.Option>
					<NativeSelect.Option value="finished">Finished</NativeSelect.Option>
					<NativeSelect.Option value="did_not_finish">Did not finish</NativeSelect.Option>
				</NativeSelect.Root>
			</div>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={saving || (!selectedBookId && !selectedBookUrl)}>
					{saving ? 'Saving…' : 'Save Reading'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
