<script lang="ts">
  // One auto-add playlist's options, opened from its pill (ticket 07: "beside the channel filter"):
  // what it takes, its required percentage, then its channel filter.
  import X from "@lucide/svelte/icons/x";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { app, ensureSetup, optionsFor, playlistTitle, type ChannelFilter, type PlaylistOptions, type Takes } from "$lib/state.svelte";
  import { channels, type AccountId } from "$lib/data";
  import { cn } from "$lib/utils";
  import { matchChannel } from "./helpers";

  let {
    account,
    playlistId,
    readonly = false,
    onclose,
  }: { account: AccountId; playlistId: string; readonly?: boolean; onclose: () => void } = $props();

  const opts = $derived(optionsFor(playlistId, account));
  const filter = $derived(app.setups[account]?.filters[playlistId]);
  let typed = $state("");
  let error = $state("");
  let pctError = $state("");

  function ensureOpts(): PlaylistOptions {
    const s = ensureSetup(account);
    if (!s.playlistOptions[playlistId]) s.playlistOptions[playlistId] = { takes: "videos", percent: null };
    return s.playlistOptions[playlistId];
  }

  /** The filter, created on first edit (switched off, denylist, empty). */
  function ensureFilter(): ChannelFilter {
    const s = ensureSetup(account);
    if (!s.filters[playlistId]) s.filters[playlistId] = { enabled: false, mode: "deny", channels: [] };
    return s.filters[playlistId];
  }

  /** Commit only a whole number from 1 to 100; never store a half-typed value. */
  function commitPercent(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const n = Number(el.value);
    if (!el.value.trim() || !Number.isInteger(n) || n < 1 || n > 100) {
      pctError = "Use a whole number from 1 to 100.";
      el.value = String(opts.percent ?? app.features.autoAdd.threshold);
      return;
    }
    pctError = "";
    ensureOpts().percent = n;
  }

  function add() {
    const key = matchChannel(typed);
    if (!key) {
      error = "That doesn't look like a channel. Try an @handle or a channel URL.";
      return;
    }
    const f = ensureFilter();
    if (!f.channels.includes(key)) f.channels.push(key);
    f.enabled = true;
    typed = "";
    error = "";
  }

  const takesChoices: { v: Takes; t: string }[] = [
    { v: "videos", t: "Videos" },
    { v: "shorts", t: "Shorts" },
    { v: "both", t: "Both" },
  ];
  const label = "text-muted-foreground mb-1 block text-[11px] font-semibold tracking-wide uppercase";
</script>

<div class="bg-muted/60 mt-1 mb-1.5 ml-6 space-y-2.5 rounded-md p-2 text-xs">
  <div class="flex items-center gap-2">
    <span class="flex-1 font-medium">Options for {playlistTitle(playlistId, account)}</span>
    <button type="button" class="opacity-60 hover:opacity-100" aria-label="Close" onclick={onclose}><X class="size-3.5" /></button>
  </div>

  <div>
    <span class={label}>Takes</span>
    <div class="border-input bg-background inline-flex overflow-hidden rounded-md border" role="radiogroup" aria-label="Takes">
      {#each takesChoices as c (c.v)}
        <button
          type="button"
          role="radio"
          aria-checked={opts.takes === c.v}
          disabled={readonly}
          class={cn("px-2.5 py-1", opts.takes === c.v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
          onclick={() => (ensureOpts().takes = c.v)}>{c.t}</button
        >
      {/each}
    </div>
  </div>

  <div>
    <span class={label}>Required percentage</span>
    <label class="flex items-center gap-2">
      <Checkbox
        disabled={readonly}
        checked={opts.percent !== null}
        onCheckedChange={(v) => (ensureOpts().percent = v ? (opts.percent ?? app.features.autoAdd.threshold) : null)}
      />
      Use its own
      {#if opts.percent === null}
        <span class="text-muted-foreground">· Default ({app.features.autoAdd.threshold} %)</span>
      {:else}
        <input
          type="number"
          min="1"
          max="100"
          class="border-input bg-background h-6 w-14 rounded-md border px-1.5"
          value={opts.percent}
          disabled={readonly}
          onchange={commitPercent}
        />
        %
      {/if}
    </label>
    {#if pctError}<p class="text-destructive mt-1">{pctError}</p>{/if}
  </div>

  <div>
    <span class={label}>Channel filter</span>
    <label class="mb-1.5 flex items-center gap-2">
      <Switch size="sm" disabled={readonly} checked={filter?.enabled ?? false} onCheckedChange={(v) => (ensureFilter().enabled = v)} />
      <span>{filter?.enabled ? "On" : "Off: every channel gets through, the list is kept"}</span>
    </label>
    <div class="mb-1.5 flex flex-col gap-1">
      {#each [{ v: "allow", t: "Only listed channels (allowlist)" }, { v: "deny", t: "All except listed channels (denylist)" }] as m (m.v)}
        <label class="flex items-center gap-1.5">
          <input
            type="radio"
            name="mode-{playlistId}"
            disabled={readonly}
            checked={(filter?.mode ?? "deny") === m.v}
            onchange={() => (ensureFilter().mode = m.v as "allow" | "deny")}
          />
          {m.t}
        </label>
      {/each}
    </div>
    <div class="mb-1.5 flex flex-wrap gap-1">
      {#each filter?.channels ?? [] as key (key)}
        <span class="bg-background inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
          {channels[key]?.title ?? key}
          {#if !readonly}
            <button
              type="button"
              aria-label="Remove {channels[key]?.title}"
              class="opacity-60 hover:opacity-100"
              onclick={() => {
                const f = ensureFilter();
                f.channels = f.channels.filter((c) => c !== key);
              }}><X class="size-3" /></button
            >
          {/if}
        </span>
      {:else}
        <span class="text-muted-foreground">No listed channels yet.</span>
      {/each}
    </div>
    {#if !readonly}
      <div class="flex gap-1.5">
        <input
          class="border-input bg-background h-7 min-w-0 flex-1 rounded-md border px-2"
          placeholder="@handle or channel URL"
          bind:value={typed}
          onkeydown={(e) => e.key === "Enter" && add()}
        />
        <Button size="xs" variant="outline" onclick={add}>Add</Button>
      </div>
      {#if error}<p class="text-destructive mt-1">{error}</p>{/if}
    {/if}
  </div>
</div>
