<script lang="ts">
	import { page } from '$app/state';
	import UsersIcon from '@lucide/svelte/icons/users';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import { resolve } from '$app/paths';

	let { children, data } = $props();

	const navItems = $derived([
		{ href: '/admin', label: 'Dashboard', icon: LayoutDashboardIcon, show: true },
		{
			href: '/admin/members',
			label: 'Members',
			icon: UsersIcon,
			show: data.permissions.has('members:edit')
		},
		{
			href: '/admin/moderation',
			label: 'Moderation',
			icon: ShieldIcon,
			show: data.permissions.has('moderate')
		},
		{
			href: '/admin/sessions',
			label: 'Sessions',
			icon: CalendarIcon,
			show: data.permissions.has('sessions:edit')
		},
		{
			href: '/admin/books',
			label: 'Books',
			icon: BookOpenIcon,
			show: data.permissions.has('book:edit')
		}
	] as const);
</script>

<div class="flex flex-col gap-6 md:flex-row">
	<aside class="shrink-0 md:w-48">
		<nav class="flex flex-row gap-1 md:flex-col">
			{#each navItems as item (item.href)}
				{#if item.show}
					<a
						href={resolve(item.href)}
						class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors {page.url
							.pathname === item.href
							? 'bg-primary text-primary-foreground'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
					>
						<item.icon class="h-4 w-4" />
						{item.label}
					</a>
				{/if}
			{/each}
		</nav>
	</aside>

	<div class="min-w-0 flex-1">
		{@render children()}
	</div>
</div>
