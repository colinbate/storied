<script lang="ts">
	import { formatSessionTimes } from '$shared/session-time';

	let {
		session,
		memberTimeZone
	}: {
		session: { startsAt: string | null; timezone?: string | null };
		memberTimeZone?: string | null;
	} = $props();
	const times = $derived(formatSessionTimes(session, memberTimeZone));
</script>

<span>
	{#if times.datetime}
		<time datetime={times.datetime}>{times.event}</time>
	{:else}
		{times.event}
	{/if}
	{#if times.local}
		<span class="block"
			>Your time: <time datetime={times.datetime ?? undefined}>{times.local}</time></span
		>
	{/if}
</span>
