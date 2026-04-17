<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { enhance as svelteEnhance } from '$app/forms';
	import { createConfirm } from './confirm.svelte';
	import { Button, type ButtonSize, type ButtonVariant } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import { Popover as PopoverPrimitive } from 'bits-ui';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import type { ClassValue } from 'clsx';

	interface Props {
		confirmText: string;
		children?: Snippet;
		/** Callback for simple confirmation (non-form) */
		onconfirm?: () => void;
		/** Form action URL for form-based confirmation */
		formAction?: string;
		/** Form method (defaults to POST) */
		formMethod?: 'POST' | 'GET';
		/** Hidden form data as key-value pairs */
		formData?: Record<string, string | number | boolean | null | undefined>;
		/** SvelteKit enhance function for form handling */
		enhance?: SubmitFunction;
		size?: ButtonSize;
		variant?: ButtonVariant;
		class?: ClassValue;
		side?: 'left' | 'top';
		disabled?: boolean;
		title?: string;
		pauseMs?: number;
	}

	let {
		confirmText,
		onconfirm,
		formAction,
		formMethod = 'POST',
		formData,
		enhance: enhanceFn,
		children,
		size,
		variant,
		class: className,
		side = 'top',
		disabled = false,
		title,
		pauseMs
	}: Props = $props();

	let submitting = $state(false);
	let formRef: HTMLFormElement | undefined = $state();

	const isFormMode = $derived(!!formAction);

	const handleConfirm = () => {
		if (isFormMode && formRef) {
			formRef.requestSubmit();
		} else if (onconfirm) {
			onconfirm();
		}
	};

	const confirm = $derived(createConfirm(handleConfirm, pauseMs));

	const defaultEnhance: SubmitFunction = () => {
		submitting = true;
		return async ({ update }) => {
			submitting = false;
			await update();
		};
	};

	const handleEnhance: SubmitFunction = (input) => {
		submitting = true;
		const userEnhance = enhanceFn ? enhanceFn(input) : defaultEnhance(input);

		return async (result) => {
			submitting = false;
			if (userEnhance && typeof userEnhance === 'object' && 'then' in userEnhance) {
				const resolved = await userEnhance;
				if (resolved) {
					await resolved(result);
				}
			} else if (typeof userEnhance === 'function') {
				await userEnhance(result);
			}
		};
	};

	// Map side prop to Popover side
	const popoverSide = $derived(side === 'left' ? 'left' : 'top');
</script>

<Popover.Root open={confirm.ready}>
	<Popover.Trigger>
		{#snippet child({ props })}
			{#if isFormMode}
				<form
					bind:this={formRef}
					method={formMethod}
					action={formAction}
					use:svelteEnhance={handleEnhance}
					class="contents"
				>
					{#if formData}
						{#each Object.entries(formData) as [name, value] (name)}
							{#if value !== null && value !== undefined}
								<input type="hidden" {name} value={String(value)} />
							{/if}
						{/each}
					{/if}
					<Button
						{...props}
						type="button"
						onclick={confirm.onclick}
						variant={confirm.confirming ? `destructive` : (variant ?? `secondary`)}
						class={[className]}
						{size}
						disabled={disabled || submitting}
						{title}
					>
						{#if submitting}
							<LoaderCircle class="size-4 animate-spin" />
						{:else if children}
							{@render children()}
						{:else}
							Confirm
						{/if}
					</Button>
				</form>
			{:else}
				<Button
					{...props}
					onclick={confirm.onclick}
					variant={confirm.confirming ? `destructive` : (variant ?? `secondary`)}
					class={[className]}
					{size}
					{disabled}
					{title}
				>
					{#if children}
						{@render children()}
					{:else}
						Confirm
					{/if}
				</Button>
			{/if}
		{/snippet}
	</Popover.Trigger>
	<Popover.Content
		side={popoverSide}
		sideOffset={4}
		class="w-auto border-0 bg-rose-500 px-3 py-1.5 text-sm text-white"
	>
		{confirmText}
		<PopoverPrimitive.Arrow>
			{#snippet child({ props })}
				<div
					class="z-50 size-2.5 rotate-45 rounded-[2px] bg-rose-500 data-[side=bottom]:-translate-x-1/2 data-[side=bottom]:-translate-y-[calc(-50%_+_1px)] data-[side=left]:-translate-y-[calc(50%_-_3px)] data-[side=right]:translate-x-[calc(50%_+_2px)] data-[side=right]:translate-y-1/2 data-[side=top]:translate-x-1/2 data-[side=top]:translate-y-[calc(-50%_+_2px)]"
					{...props}
				></div>
			{/snippet}
		</PopoverPrimitive.Arrow>
	</Popover.Content>
</Popover.Root>
