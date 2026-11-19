<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';
	import {
		BOOK_ACCESS_FORMATS,
		BOOK_ACCESS_FORMAT_LABELS,
		parseBookAccessFormats
	} from '$shared/book-availability';

	let {
		option,
		onsaved,
		oncancel
	}: {
		option: {
			id?: string;
			providerName: string;
			providerType: string;
			format: string;
			url?: string | null;
			note?: string | null;
		};
		onsaved: () => void;
		oncancel: () => void;
	} = $props();
	const id = $props.id();
	let saving = $state(false);
	let errorMessage = $state('');
	const selectedFormats = $derived(parseBookAccessFormats(option.format));
</script>

<form
	method="POST"
	action={option.id ? '?/updateAccessOption' : '?/addAccessOption'}
	aria-label={option.id ? `Edit ${option.providerName} availability` : 'Add availability'}
	class="grid gap-3 md:grid-cols-2"
	use:enhance={() => {
		saving = true;
		errorMessage = '';
		return async ({ result, update }) => {
			saving = false;
			await update({ reset: false });
			if (result.type === 'success') {
				toast.success(option.id ? 'Availability updated.' : 'Availability added.');
				onsaved();
			} else {
				errorMessage =
					result.type === 'failure'
						? String(result.data?.error ?? 'Unable to save availability.')
						: 'Unable to save availability. Try again.';
				toast.error(errorMessage);
			}
		};
	}}
>
	{#if option.id}<input type="hidden" name="accessOptionId" value={option.id} />{/if}
	<div class="space-y-2">
		<Label for="{id}-provider">Provider</Label>
		<Input id="{id}-provider" name="providerName" value={option.providerName} required />
	</div>
	<div class="space-y-2">
		<Label for="{id}-provider-type">Provider Type</Label>
		<NativeSelect
			id="{id}-provider-type"
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
	<fieldset class="md:col-span-2">
		<legend class="text-sm font-medium">Formats (select at least one)</legend>
		<div class="flex flex-wrap gap-x-4">
			{#each BOOK_ACCESS_FORMATS as format (format)}
				<label
					for="{id}-{format}"
					class="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm"
				>
					<input
						id="{id}-{format}"
						type="checkbox"
						name="format"
						value={format}
						checked={selectedFormats.includes(format)}
						class="size-4 appearance-auto accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					/>
					{BOOK_ACCESS_FORMAT_LABELS[format]}
				</label>
			{/each}
		</div>
	</fieldset>
	<div class="space-y-2 md:col-span-2">
		<Label for="{id}-url">Link (optional)</Label>
		<Input
			id="{id}-url"
			name="url"
			type="url"
			value={option.url ?? ''}
			autocorrect="off"
			autocapitalize="none"
			spellcheck={false}
		/>
	</div>
	<div class="space-y-2 md:col-span-2">
		<Label for="{id}-note">Note (optional)</Label>
		<Input id="{id}-note" name="note" value={option.note ?? ''} />
	</div>
	{#if errorMessage}<p role="alert" class="text-sm text-destructive md:col-span-2">
			{errorMessage}
		</p>{/if}
	<div class="flex gap-2 md:col-span-2">
		<Button type="submit" disabled={saving}
			>{option.id ? 'Save Availability' : 'Add Availability'}</Button
		>
		<Button type="button" variant="ghost" disabled={saving} onclick={oncancel}>Cancel</Button>
	</div>
</form>
