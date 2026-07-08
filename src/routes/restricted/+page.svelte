<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import TriangleIcon from '@lucide/svelte/icons/triangle';

	let { data, form } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Restricted Catalog — The Archive</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if data.revealed}
	<article class="mx-auto w-full max-w-3xl py-10 sm:py-16">
		<header class="border-b border-foreground/20 pb-8 text-center">
			<TriangleIcon class="mx-auto mb-5 h-8 w-8 fill-foreground stroke-[1.25]" />
			<p class="font-mono text-xs tracking-[0.3em] text-muted-foreground uppercase">
				Bermuda Triangle Society · Archive Access I
			</p>
			<h1 class="mt-5 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
				Restricted Catalog
			</h1>
		</header>

		<section class="space-y-5 py-10 text-lg leading-8">
			<p>If you are reading this, the Archive has accepted your application.</p>
			<p>
				The public believes the Bermuda Triangle Society is a book club.<br />
				<strong>Please continue allowing them to believe that.</strong>
			</p>
			<p>
				The volumes discussed in public are not merely selections. They are references: records of
				incidents, warnings disguised as fiction, and, occasionally, instructions.
			</p>
			<p>
				Some stories are preserved so they will not be forgotten. Others are preserved so they will
				not be repeated.
			</p>
		</section>

		<section class="border-y border-foreground/20 py-8 font-mono text-sm">
			<div class="grid gap-5 sm:grid-cols-[10rem_1fr]">
				<span class="text-muted-foreground">CLEARANCE</span><span>LEVEL I · PROVISIONAL</span>
				<span class="text-muted-foreground">DESIGNATION</span><span
					>{data.signedIn ? data.memberName : 'UNIDENTIFIED READER'}</span
				>
				<span class="text-muted-foreground">CATALOG STATUS</span><span>PARTIAL INDEX RESTORED</span>
			</div>
		</section>

		<section class="space-y-6 py-10">
			<h2 class="font-mono text-sm tracking-[0.2em] uppercase">Recovered index fragments</h2>
			<div class="space-y-3 font-mono text-sm">
				<p class="rounded border p-4">
					BT-03 · THE FIRST ARCHIVIST · <span class="bg-foreground text-foreground">REDACTED</span>
				</p>
				<p class="rounded border p-4">BT-17 · INCIDENT AT ARGUS BANK · RECORD SEALED</p>
				<p class="rounded border p-4">BT-41 · PROTOCOL FOR FALSE HORIZONS · ACCESS II REQUIRED</p>
			</div>
			<p class="text-sm text-muted-foreground">
				This terminal contains only the first layer of the catalog. Further records require a higher
				designation. The Archive does not publish the requirements for advancement.
			</p>
		</section>

		{#if !data.signedIn}
			<section class="rounded-lg border bg-muted/30 p-6 text-center">
				<p class="font-medium">Recognition has not been attached to an identity.</p>
				<p class="mt-2 text-sm text-muted-foreground">
					Identify yourself within 30 days to preserve this clearance in the Archive.
				</p>
				<Button class="mt-5" href="/auth/login?redirect=/restricted">Identify yourself</Button>
			</section>
		{:else if data.newlyClaimed}
			<p class="text-center text-sm text-muted-foreground">Your Archive record has been amended.</p>
		{/if}
	</article>
{:else}
	<div class="flex min-h-[70vh] flex-1 flex-col items-center justify-center px-4">
		<div class="w-full max-w-md text-center">
			<TriangleIcon class="mx-auto mb-6 h-7 w-7 stroke-[1.25] text-muted-foreground" />
			<p class="font-mono text-xs tracking-[0.3em] text-muted-foreground uppercase">
				Catalog terminal 01
			</p>
			<h1 class="mt-3 text-2xl font-semibold">Restricted Access</h1>
			<form
				method="POST"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						submitting = false;
						await update();
					};
				}}
				class="mt-8 space-y-4"
			>
				<Input
					name="code"
					class="text-center font-mono tracking-widest"
					autocomplete="off"
					aria-label="Catalog identity"
					required
					autofocus
				/>
				{#if form?.error}
					<p class="text-sm text-destructive">{form.error}</p>
				{/if}
				<Button type="submit" class="w-full" disabled={submitting || !data.configured}>
					{submitting ? 'Consulting index…' : 'Consult index'}
				</Button>
			</form>
			<a
				href={resolve('/')}
				class="mt-8 inline-block text-xs text-muted-foreground hover:underline"
			>
				Return to public catalog
			</a>
		</div>
	</div>
{/if}
