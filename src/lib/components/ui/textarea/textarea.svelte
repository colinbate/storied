<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from '$lib/utils.js';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		'data-slot': dataSlot = 'textarea',
		onkeydown,
		...restProps
	}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();

	const mirrorValue = $derived(`${value ?? ''}\n`);

	function setCursor(textarea: HTMLTextAreaElement, position: number) {
		queueMicrotask(() => {
			textarea.selectionStart = position;
			textarea.selectionEnd = position;
		});
	}

	function handleKeydown(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
		onkeydown?.(event);
		if (
			event.defaultPrevented ||
			event.key !== 'Enter' ||
			event.shiftKey ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey
		) {
			return;
		}

		const textarea = event.currentTarget;
		const currentValue = String(value ?? textarea.value);
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		if (start !== end) return;

		const lineStart = currentValue.lastIndexOf('\n', start - 1) + 1;
		const nextLineBreak = currentValue.indexOf('\n', start);
		const lineEnd = nextLineBreak === -1 ? currentValue.length : nextLineBreak;
		const lineBeforeCursor = currentValue.slice(lineStart, start);
		const lineAfterCursor = currentValue.slice(start, lineEnd);
		if (lineAfterCursor.length > 0) return;

		const emptyListItem = lineBeforeCursor.match(/^(\s*)([-+*]|\d+[.)])\s*$/);
		if (emptyListItem) {
			event.preventDefault();
			value = currentValue.slice(0, lineStart) + currentValue.slice(start);
			setCursor(textarea, lineStart);
			return;
		}

		const listItem = lineBeforeCursor.match(/^(\s*)([-+*]|\d+[.)])(\s+)/);
		if (!listItem) return;

		const marker = `${listItem[1]}${listItem[2]}${listItem[3]}`;
		const insertion = `\n${marker}`;
		event.preventDefault();
		value = currentValue.slice(0, start) + insertion + currentValue.slice(end);
		setCursor(textarea, start + insertion.length);
	}
</script>

<div class="grid w-full min-w-0 flex-1">
	<textarea
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			'col-start-1 row-start-1 flex field-sizing-content h-full min-h-16 w-full resize-none overflow-hidden rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
			className
		)}
		bind:value
		onkeydown={handleKeydown}
		{...restProps}
	></textarea>
	<div
		aria-hidden="true"
		class={cn(
			'wrap-break-words pointer-events-none invisible col-start-1 row-start-1 min-h-16 w-full rounded-lg border px-2.5 py-2 text-base whitespace-pre-wrap',
			className
		)}
	>
		{mirrorValue}
	</div>
</div>
