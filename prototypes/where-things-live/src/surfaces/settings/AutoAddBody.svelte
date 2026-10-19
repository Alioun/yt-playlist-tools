<script lang="ts">
  // Auto-add's settings: this account's playlists, each with its options (takes, percentage, ticket 07)
  // and channel filter in one popover, then the shared options.
  import * as Popover from "$lib/components/ui/popover/index.js";
  import PlaylistPicker from "$lib/components/PlaylistPicker.svelte";
  import { app, ensureSetup, setupReadOnly, accountName, optionsFor } from "$lib/state.svelte";
  import type { AccountId } from "$lib/data";
  import ChannelFilterEditor from "./ChannelFilterEditor.svelte";
  import PlaylistOptionsEditor from "./PlaylistOptionsEditor.svelte";
  import OptionSwitch from "./OptionSwitch.svelte";

  let { account }: { account: AccountId } = $props();

  const setup = $derived(app.setups[account]);
  const readonly = $derived(setupReadOnly() || !app.env.youtubeOpen);
  const name = $derived(accountName(account));
  const threshold = $derived(app.features.autoAdd.threshold);

  /** The non-default parts of a playlist's options, e.g. "Shorts too · 90 % · Only 3 channels". */
  function pillParts(pid: string): string[] {
    const o = optionsFor(pid, account);
    const parts: string[] = [];
    if (o.takes === "shorts") parts.push("Shorts only");
    if (o.takes === "both") parts.push("Shorts too");
    if (o.percent !== null) parts.push(`${o.percent} %`);
    const f = setup?.filters[pid];
    if (f?.enabled) {
      const n = f.channels.length;
      const ch = n === 1 ? "channel" : "channels";
      parts.push(f.mode === "allow" ? `Only ${n} ${ch}` : `All but ${n} ${ch}`);
    }
    return parts;
  }

  const thresholdText = (n: number) =>
    n === 0 ? "As soon as it starts playing" : n === 100 ? "Only when watched in full" : `${n} %`;
</script>

<div>
  <div class="mb-1.5 flex items-baseline justify-between gap-2">
    <h4 class="text-sm font-medium">Auto-add playlists for {name}</h4>
    <span class="text-muted-foreground text-xs">{setup?.autoAdd.length ?? 0} chosen</span>
  </div>
  {#if !setup}
    <p class="text-muted-foreground mb-1.5 text-xs">{name} has no setup yet. Ticking a playlist starts one.</p>
  {/if}
  {#if setupReadOnly()}
    <p class="mb-1.5 text-xs text-amber-700 dark:text-amber-400">Private window: you can change this only in a normal window.</p>
  {:else if !app.env.youtubeOpen}
    <p class="mb-1.5 text-xs text-amber-700 dark:text-amber-400">Saved list from {app.env.cachedAgo}. Open YouTube to change or refresh it.</p>
  {/if}
  <PlaylistPicker
    {account}
    mode="multi"
    {readonly}
    maxHeight="15rem"
    bind:selected={() => setup?.autoAdd ?? [], (v) => (ensureSetup(account).autoAdd = v)}
  >
    {#snippet rowExtra(p)}
      {#if setup?.autoAdd.includes(p.id)}
        {@const parts = pillParts(p.id)}
        <Popover.Root>
          <Popover.Trigger
            class="hover:bg-background shrink-0 rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap {parts.length
              ? 'border-primary/40 text-primary'
              : 'text-muted-foreground'}"
          >
            {parts.length ? parts.join(" · ") : "Options"}
          </Popover.Trigger>
          <Popover.Content align="end" class="max-h-[32rem] w-auto overflow-y-auto">
            <PlaylistOptionsEditor {account} playlistId={p.id} />
            <div class="my-3 border-t"></div>
            <ChannelFilterEditor {account} playlistId={p.id} />
          </Popover.Content>
        </Popover.Root>
      {/if}
    {/snippet}
  </PlaylistPicker>
  <p class="text-muted-foreground mt-1 text-xs">
    The pill on a ticked playlist opens its options: what it takes, its own percentage, and its channel filter.
  </p>
</div>

<div class="border-t pt-3">
  <h4 class="mb-1 text-sm font-medium">For every account</h4>
  <div class="py-1.5">
    <div class="flex items-center justify-between gap-3 text-sm">
      <span>Required percentage, the default for every playlist</span>
      <span class="font-medium whitespace-nowrap tabular-nums">{thresholdText(threshold)}</span>
    </div>
    <input
      type="range"
      class="accent-primary mt-2 w-full"
      min="0"
      max="100"
      step="5"
      aria-label="Required percentage, the default for every playlist"
      bind:value={app.features.autoAdd.threshold}
    />
    <div class="text-muted-foreground flex justify-between text-[11px]">
      <span>As soon as it starts playing</span>
      <span>Only when watched in full</span>
    </div>
    <p class="text-muted-foreground mt-1 text-xs">
      Each playlist can take its own percentage, and say whether it takes videos, Shorts or both.
    </p>
  </div>
  <OptionSwitch
    label="Show a toast when a video is added"
    hint="Failures always show."
    bind:checked={app.features.autoAdd.toast}
  />
  <OptionSwitch
    label="Tick on the toolbar icon when this tab's video is added"
    tag="provisional"
    bind:checked={app.features.autoAdd.badge}
  />
</div>
