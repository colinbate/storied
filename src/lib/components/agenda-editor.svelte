<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import ConfirmButton from '$lib/components/confirm-button.svelte';
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import CheckIcon from '@lucide/svelte/icons/check';
	import XIcon from '@lucide/svelte/icons/x';

	export type AgendaEditorItem = {
		id: string;
		title: string;
		description: string | null;
		visibility: 'members' | 'facilitator';
		status?: 'pending' | 'ready' | 'completed' | 'skipped';
		source?: 'facilitator' | 'member';
	};

	let {
		items,
		emptyText = 'No agenda has been added yet.'
	}: {
		items: AgendaEditorItem[];
		emptyText?: string;
	} = $props();

	let editingId = $state<string | null>(null);
	let addOpen = $state(false);
	let dragId = $state<string | null>(null);
	let dropTargetId = $state<string | null>(null);
	let reorderForm = $state<HTMLFormElement | null>(null);
	let pendingOrder = $state<string[] | null>(null);

	const listed = $derived(items.filter((item) => item.status !== 'pending'));
	const suggestions = $derived(items.filter((item) => item.status === 'pending'));
	/** Optimistic order while a drag result is saving. */
	const ordered = $derived(
		pendingOrder
			? pendingOrder
					.map((id) => listed.find((item) => item.id === id))
					.filter((item): item is AgendaEditorItem => Boolean(item))
			: listed
	);

	const feedback: (message?: string) => SubmitFunction = (message) => () => {
		return async ({ result, update }) => {
			await update({ reset: result.type === 'success' });
			if (result.type === 'success') {
				if (message) toast.success(message);
				editingId = null;
				addOpen = false;
			} else if (result.type === 'failure' && result.data?.error) {
				toast.error(String(result.data.error));
			}
		};
	};

	const reorderEnhance: SubmitFunction = () => {
		return async ({ result, update }) => {
			await update({ reset: false });
			pendingOrder = null;
			if (result.type === 'failure' && result.data?.error) toast.error(String(result.data.error));
		};
	};

	function onDrop(targetId: string) {
		if (!dragId || dragId === targetId) {
			dragId = null;
			dropTargetId = null;
			return;
		}
		const ids = ordered.map((item) => item.id);
		const from = ids.indexOf(dragId);
		const to = ids.indexOf(targetId);
		ids.splice(from, 1);
		ids.splice(to, 0, dragId);
		pendingOrder = ids;
		dragId = null;
		dropTargetId = null;
		queueMicrotask(() => reorderForm?.requestSubmit());
	}
</script>

{#snippet itemForm(
	action: string,
	item: AgendaEditorItem | null,
	submitLabel: string,
	oncancel: () => void
)}
	<form
		method="POST"
		{action}
		use:enhance={feedback('Agenda saved.')}
		class="space-y-3 rounded-lg border bg-muted/30 p-3"
	>
		{#if item}<input type="hidden" name="itemId" value={item.id} />{/if}
		<div class="space-y-1">
			<Label for="agenda-title-{item?.id ?? 'new'}">Title</Label>
			<Input
				id="agenda-title-{item?.id ?? 'new'}"
				name="title"
				value={item?.title ?? ''}
				required
				maxlength={200}
			/>
		</div>
		<div class="space-y-1">
			<Label for="agenda-description-{item?.id ?? 'new'}">Notes (optional)</Label>
			<Input
				id="agenda-description-{item?.id ?? 'new'}"
				name="description"
				value={item?.description ?? ''}
				maxlength={500}
			/>
		</div>
		<div class="flex flex-wrap items-end justify-between gap-3">
			<div class="space-y-1">
				<Label for="agenda-visibility-{item?.id ?? 'new'}">Who sees it</Label>
				<NativeSelect
					id="agenda-visibility-{item?.id ?? 'new'}"
					name="visibility"
					value={item?.visibility ?? 'members'}
				>
					<NativeSelectOption value="members">Members</NativeSelectOption>
					<NativeSelectOption value="facilitator">Facilitator only</NativeSelectOption>
				</NativeSelect>
			</div>
			<div class="flex gap-2">
				<Button type="button" variant="ghost" size="sm" onclick={oncancel}>Cancel</Button>
				<Button type="submit" size="sm">{submitLabel}</Button>
			</div>
		</div>
	</form>
{/snippet}

<div class="space-y-4">
	{#if ordered.length === 0}
		<p class="text-sm text-muted-foreground">{emptyText}</p>
	{:else}
		<ol class="space-y-2">
			{#each ordered as item, index (item.id)}
				<li
					class={[
						'rounded-lg border bg-card',
						dropTargetId === item.id &&
							dragId !== item.id &&
							'border-primary ring-2 ring-primary/30',
						dragId === item.id && 'opacity-60'
					]}
					draggable={editingId === null}
					ondragstart={(event) => {
						dragId = item.id;
						event.dataTransfer?.setData('text/plain', item.id);
					}}
					ondragover={(event) => {
						event.preventDefault();
						dropTargetId = item.id;
					}}
					ondragleave={() => {
						if (dropTargetId === item.id) dropTargetId = null;
					}}
					ondrop={(event) => {
						event.preventDefault();
						onDrop(item.id);
					}}
					ondragend={() => {
						dragId = null;
						dropTargetId = null;
					}}
				>
					{#if editingId === item.id}
						<div class="p-2">
							{@render itemForm('?/updateAgendaItem', item, 'Save', () => (editingId = null))}
						</div>
					{:else}
						<div class="flex items-start gap-2 p-2">
							<span
								class="mt-2 hidden cursor-grab text-muted-foreground sm:block"
								aria-hidden="true"
							>
								<GripVerticalIcon class="h-4 w-4" />
							</span>
							<div class="flex flex-col">
								<form method="POST" action="?/moveAgendaItem" use:enhance={feedback()}>
									<input type="hidden" name="itemId" value={item.id} />
									<input type="hidden" name="direction" value="up" />
									<Button
										type="submit"
										variant="ghost"
										size="icon-sm"
										disabled={index === 0}
										aria-label="Move up"
									>
										<ChevronUpIcon class="h-4 w-4" />
									</Button>
								</form>
								<form method="POST" action="?/moveAgendaItem" use:enhance={feedback()}>
									<input type="hidden" name="itemId" value={item.id} />
									<input type="hidden" name="direction" value="down" />
									<Button
										type="submit"
										variant="ghost"
										size="icon-sm"
										disabled={index === ordered.length - 1}
										aria-label="Move down"
									>
										<ChevronDownIcon class="h-4 w-4" />
									</Button>
								</form>
							</div>
							<div class="min-w-0 flex-1 py-1.5">
								<div class="flex flex-wrap items-center gap-2">
									<span
										class={[
											'font-medium',
											item.status === 'skipped' && 'text-muted-foreground line-through'
										]}
									>
										{item.title}
									</span>
									{#if item.visibility === 'facilitator'}
										<Badge variant="outline" class="gap-1 px-1.5 py-0 text-[10px]">
											<EyeOffIcon class="h-3 w-3" /> Facilitator only
										</Badge>
									{/if}
									{#if item.status === 'completed'}
										<Badge variant="secondary" class="px-1.5 py-0 text-[10px]">Done</Badge>
									{:else if item.status === 'skipped'}
										<Badge variant="secondary" class="px-1.5 py-0 text-[10px]">Skipped</Badge>
									{/if}
									{#if item.source === 'member'}
										<Badge variant="outline" class="px-1.5 py-0 text-[10px]"
											>Member suggestion</Badge
										>
									{/if}
								</div>
								{#if item.description}
									<p class="text-sm text-muted-foreground">{item.description}</p>
								{/if}
							</div>
							<div class="flex shrink-0 items-center">
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label="Edit {item.title}"
									onclick={() => (editingId = item.id)}
								>
									<PencilIcon class="h-4 w-4" />
								</Button>
								<ConfirmButton
									confirmText="Remove this agenda item?"
									formAction="?/deleteAgendaItem"
									formData={{ itemId: item.id }}
									enhance={feedback('Agenda item removed.')}
									variant="ghost"
									size="icon-sm"
									title="Remove {item.title}"
								>
									<Trash2Icon class="h-4 w-4" />
								</ConfirmButton>
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ol>
		<form
			method="POST"
			action="?/reorderAgenda"
			use:enhance={reorderEnhance}
			class="hidden"
			bind:this={reorderForm}
		>
			{#each pendingOrder ?? [] as id (id)}
				<input type="hidden" name="itemId" value={id} />
			{/each}
		</form>
	{/if}

	{#if suggestions.length > 0}
		<div class="space-y-2 rounded-lg border border-dashed p-3">
			<p class="text-xs font-medium text-muted-foreground uppercase">
				Member suggestions ({suggestions.length})
			</p>
			{#each suggestions as item (item.id)}
				{#if editingId === item.id}
					{@render itemForm(
						'?/acceptSuggestion',
						item,
						'Accept with changes',
						() => (editingId = null)
					)}
				{:else}
					<div class="flex flex-wrap items-center gap-2 rounded-md bg-card p-2">
						<div class="min-w-0 flex-1">
							<p class="font-medium">{item.title}</p>
							{#if item.description}<p class="text-sm text-muted-foreground">
									{item.description}
								</p>{/if}
						</div>
						<form
							method="POST"
							action="?/acceptSuggestion"
							use:enhance={feedback('Added to the agenda.')}
						>
							<input type="hidden" name="itemId" value={item.id} />
							<Button type="submit" size="sm">
								<CheckIcon class="h-4 w-4" /> Accept
							</Button>
						</form>
						<Button size="sm" variant="outline" onclick={() => (editingId = item.id)}>
							<PencilIcon class="h-4 w-4" /> Edit
						</Button>
						<ConfirmButton
							confirmText="Reject this suggestion?"
							formAction="?/rejectSuggestion"
							formData={{ itemId: item.id }}
							enhance={feedback('Suggestion removed.')}
							variant="ghost"
							size="sm"
						>
							<XIcon class="h-4 w-4" /> Reject
						</ConfirmButton>
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	{#if addOpen}
		{@render itemForm('?/createAgendaItem', null, 'Add item', () => (addOpen = false))}
	{:else}
		<Button variant="outline" size="sm" onclick={() => (addOpen = true)}>
			<PlusIcon class="h-4 w-4" /> Add agenda item
		</Button>
	{/if}
</div>
