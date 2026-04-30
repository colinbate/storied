<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { toast } from 'svelte-sonner';

	type ThemeOption = {
		id: string;
		name: string;
		status: string;
	};

	type Props = {
		themes: ThemeOption[];
		selectedId?: string;
		name?: string;
		id?: string;
		label?: string;
		required?: boolean;
		disabled?: boolean;
		action?: string;
	};

	let {
		themes,
		selectedId = $bindable(''),
		name = 'themeId',
		id = 'themeId',
		label = 'Theme',
		required = true,
		disabled = false,
		action = '?/createTheme'
	}: Props = $props();

	let createOpen = $state(false);
	let creating = $state(false);
	let newThemeName = $state('');

	function createdThemeId(data: unknown) {
		if (!data || typeof data !== 'object' || !('theme' in data)) return null;
		const theme = data.theme;
		if (!theme || typeof theme !== 'object' || !('id' in theme)) return null;
		return typeof theme.id === 'string' ? theme.id : null;
	}
</script>

<div class="space-y-2">
	<Label for={id}>{label}</Label>
	<div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
		<NativeSelect {id} {name} bind:value={selectedId} {required} class="w-full" {disabled}>
			<NativeSelectOption value="">Choose a theme</NativeSelectOption>
			{#each themes as theme (theme.id)}
				<NativeSelectOption value={theme.id}>{theme.name}</NativeSelectOption>
			{/each}
		</NativeSelect>
		<Button
			type="button"
			variant="outline"
			class="h-10"
			{disabled}
			onclick={() => {
				createOpen = true;
			}}
		>
			<PlusIcon class="h-4 w-4" />
			New Theme
		</Button>
	</div>
</div>

<Dialog.Root bind:open={createOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Create Theme</Dialog.Title>
			<Dialog.Description
				>Add the theme name now; details can be filled in later.</Dialog.Description
			>
		</Dialog.Header>
		<form
			method="POST"
			{action}
			use:enhance={() => {
				creating = true;
				return async ({ result, update }) => {
					creating = false;
					await update();
					if (result.type === 'success') {
						const themeId = createdThemeId(result.data);
						if (themeId) {
							selectedId = themeId;
							newThemeName = '';
							createOpen = false;
							toast.success('Theme created.');
						}
						if (result.data?.error) toast.error(String(result.data.error));
					}
				};
			}}
			class="space-y-4"
		>
			<div class="space-y-2">
				<Label for={`${id}-new-name`}>Name</Label>
				<Input
					id={`${id}-new-name`}
					name="name"
					bind:value={newThemeName}
					placeholder="e.g. Haunted Futures"
					required
				/>
			</div>
			<Dialog.Footer>
				<Button
					type="button"
					variant="ghost"
					onclick={() => {
						createOpen = false;
					}}
				>
					Cancel
				</Button>
				<Button type="submit" disabled={creating || newThemeName.trim().length < 2}>
					{creating ? 'Creating...' : 'Create Theme'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
