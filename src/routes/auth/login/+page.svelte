<script lang="ts">
  import { enhance } from '$app/forms';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import MailIcon from '@lucide/svelte/icons/mail';

  let { form } = $props();
  let loading = $state(false);
</script>

<svelte:head>
  <title>Sign In — Storied</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center p-4">
  <Card.Root class="w-full max-w-md">
    <Card.Header class="text-center">
      <Card.Title class="text-2xl">Welcome</Card.Title>
      <Card.Description>
        Sign in to Bermuda Triangle Society Discussions
      </Card.Description>
    </Card.Header>
    <Card.Content>
      {#if form?.success}
        <div class="text-center space-y-4">
          <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <MailIcon class="h-6 w-6 text-primary" />
          </div>
          <div>
            <p class="font-medium">Check your inbox</p>
            <p class="text-sm text-muted-foreground mt-1">
              We sent a sign-in link to <strong>{form.email}</strong>
            </p>
          </div>
          <p class="text-xs text-muted-foreground">
            The link expires in 15 minutes. Check your spam folder if you don't see it.
          </p>
        </div>
      {:else}
        <form
          method="POST"
          use:enhance={() => {
            loading = true;
            return async ({ update }) => {
              loading = false;
              await update();
            };
          }}
          class="space-y-4"
        >
          <div class="space-y-2">
            <Label for="email">Email address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              value={form?.email ?? ''}
              autocomplete="email"
            />
          </div>
          {#if form?.error}
            <p class="text-sm text-destructive">{form.error}</p>
          {/if}
          <Button type="submit" class="w-full" disabled={loading}>
            {#if loading}
              Sending…
            {:else}
              Send Magic Link
            {/if}
          </Button>
        </form>
      {/if}
    </Card.Content>
  </Card.Root>
</div>
