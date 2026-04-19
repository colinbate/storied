<script lang="ts">
	import './layout.css';
	import { goto } from '$app/navigation';
	import { ModeWatcher, toggleMode } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import { resolve } from '$app/paths';

	let { children, data } = $props();
	const user = $derived(data.user);
</script>

<ModeWatcher />
<Toaster richColors />

<div class="flex min-h-screen flex-col">
	<header class="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
		<div class="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
			<a
				href={resolve('/')}
				class="flex items-center gap-2 font-semibold text-foreground transition-colors hover:text-primary"
			>
				<img src="/favicon.svg" class="size-5" alt="logo of two message bubbles containing books" />
				<span>Bermuda Triangle Society</span>
			</a>

			<div class="flex items-center gap-2">
				<Button onclick={toggleMode} variant="ghost" size="icon" class="h-9 w-9">
					<SunIcon class="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
					<MoonIcon
						class="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
					/>
					<span class="sr-only">Toggle theme</span>
				</Button>

				{#if user}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button variant="ghost" size="sm" class="gap-2" {...props}>
									<Avatar.Root class="h-6 w-6">
										{#if user.avatarUrl}
											<Avatar.Image src={user.avatarUrl} alt={user.displayName} />
										{/if}
										<Avatar.Fallback class="text-xs"
											>{user.displayName.charAt(0).toUpperCase()}</Avatar.Fallback
										>
									</Avatar.Root>
									<span class="hidden sm:inline">{user.displayName}</span>
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="w-48">
							<DropdownMenu.Label>
								<div class="flex flex-col">
									<span>{user.displayName}</span>
									<span class="text-xs font-normal text-muted-foreground">{user.email}</span>
								</div>
							</DropdownMenu.Label>
							<DropdownMenu.Separator />
							<DropdownMenu.Item onSelect={() => goto(resolve('/settings'))}>
								<SettingsIcon class="h-4 w-4" />
								Settings
							</DropdownMenu.Item>
							{#if data.permissions.has('admin:view')}
								<DropdownMenu.Item onSelect={() => goto(resolve('/admin'))}>
									<ShieldIcon class="h-4 w-4" />
									Admin
								</DropdownMenu.Item>
							{/if}
							<DropdownMenu.Separator />
							<DropdownMenu.Item
								onclick={() => {
									const form = document.getElementById('logout-form') as HTMLFormElement;
									form?.submit();
								}}
							>
								<LogOutIcon class="h-4 w-4" />
								Sign Out
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					<form id="logout-form" method="POST" action="/auth/logout" class="hidden"></form>
				{:else}
					<Button href="/auth/login" variant="default" size="sm">Sign In</Button>
				{/if}
			</div>
		</div>
	</header>

	<main class="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 py-6">
		{@render children()}
	</main>

	<footer class="border-t py-6 text-center text-sm text-muted-foreground">
		<div class="mx-auto max-w-5xl px-4">
			<p>Bermuda Triangle Society Discussions &mdash; Powered by Storied</p>
		</div>
	</footer>
</div>
