<script lang="ts">
  // Every account with a setup, each with Remove (ticket 11). Playlist Tools never switches accounts itself.
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import AccountChip from "$lib/components/AccountChip.svelte";
  import {
    app,
    accountsWithSetup,
    removeSetup,
    discardLegacy,
    playlistTitle,
    accountName,
    shortcutTarget,
  } from "$lib/state.svelte";
  import { accounts, type AccountId } from "$lib/data";

  let confirming = $state<AccountId | null>(null);
  let open = $state(false);

  const list = $derived(accountsWithSetup());

  function summary(a: AccountId): string {
    const s = app.setups[a]!;
    const n = s.autoAdd.length;
    // Ticket 16: a setup that came by sync, whose playlists aren't loaded in this browser yet.
    if (app.notLoaded[a]) return `${n} auto-add playlist${n === 1 ? "" : "s"} · Open YouTube as ${accountName(a)} to see them`;
    const m = app.features.shortcuts.list.filter((sc) => shortcutTarget(a, sc)).length;
    return `${n} auto-add playlist${n === 1 ? "" : "s"} · ${m} shortcut playlist${m === 1 ? "" : "s"} · quick-save: ${playlistTitle(s.quickSave, a)}`;
  }
</script>

<div class="bg-card divide-y rounded-xl border">
  <div class="px-4 py-2.5">
    <h4 class="text-sm font-medium">Accounts with a setup</h4>
    <p class="text-muted-foreground text-xs">A setup holds the playlists you chose for that account. Everything else is shared.</p>
  </div>
  {#each list as a (a)}
    <div class="flex flex-wrap items-center gap-3 px-4 py-3">
      <AccountChip account={a} />
      <span class="text-muted-foreground text-xs">{accounts[a].handle}</span>
      {#if app.env.signedIn && app.env.account === a}
        <span class="bg-muted rounded-full px-1.5 py-0.5 text-[10px]">In your YouTube tab</span>
      {/if}
      <span class="text-muted-foreground w-full text-xs sm:w-auto sm:flex-1">{summary(a)}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={app.env.privateWindow}
        onclick={() => {
          confirming = a;
          open = true;
        }}>Remove</Button
      >
    </div>
  {:else}
    <p class="text-muted-foreground px-4 py-3 text-sm">
      No account has a setup yet. Tick a playlist in the popup or in Auto-add above to start one.
    </p>
  {/each}
</div>

<p class="text-muted-foreground text-xs">Other accounts you use on YouTube aren't stored until you choose a playlist for them.</p>
<p class="flex flex-wrap gap-4 text-sm">
  <a href="#signin" class="text-primary inline-flex items-center gap-1 hover:underline"
    >Sign in to YouTube <ExternalLink class="size-3" /></a
  >
  <a href="#channel_switcher" class="text-primary inline-flex items-center gap-1 hover:underline"
    >Switch account on YouTube <ExternalLink class="size-3" /></a
  >
</p>
<p class="text-muted-foreground text-xs">Playlist Tools never switches accounts itself; these open YouTube's own pages.</p>

{#if app.unclaimed}
  <div class="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
    <h4 class="text-sm font-medium">Playlists from 1.x, waiting for the YouTube account that owns them</h4>
    <ul class="text-muted-foreground mt-1 list-disc pl-5 text-xs">
      {#each app.unclaimed.autoAdd as p (p)}
        <li>Auto-add: {playlistTitle(p, "alioun") === "Missing playlist" ? p : playlistTitle(p, "alioun")}</li>
      {/each}
      <li>Shortcut: {playlistTitle(app.unclaimed.shortcutTarget, "alioun")}</li>
    </ul>
    <p class="text-muted-foreground mt-2 text-xs">
      They're picked up when you visit YouTube signed in as their owner. Kept on this device only.
    </p>
    <Button class="mt-2" size="sm" variant="outline" onclick={discardLegacy}>Discard</Button>
  </div>
{/if}

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    {#if confirming}
      <Dialog.Header>
        <Dialog.Title>Remove {accountName(confirming)}'s setup?</Dialog.Title>
        <Dialog.Description>
          Its auto-add playlists, channel filters and shortcut playlists are deleted from {app.features.sync.on
            ? "every browser that syncs your settings"
            : "this browser"}. Your playlists on YouTube aren't touched.
        </Dialog.Description>
      </Dialog.Header>
      <Dialog.Footer>
        <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
        <Button
          variant="destructive"
          onclick={() => {
            removeSetup(confirming!);
            open = false;
          }}>Remove</Button
        >
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
