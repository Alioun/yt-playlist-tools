<script lang="ts">
  // One auto-add playlist's channel filter (glossary: allowlist mode, denylist mode, listed channels).
  import X from "@lucide/svelte/icons/x";
  import Switch from "./Toggle.svelte";
  import * as RadioGroup from "$lib/components/ui/radio-group/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { app, ensureSetup, playlistTitle, setupReadOnly, type ChannelFilter } from "$lib/state.svelte";
  import { channels, type AccountId } from "$lib/data";

  let { account, playlistId }: { account: AccountId; playlistId: string } = $props();

  const filter = $derived(app.setups[account]?.filters[playlistId] as ChannelFilter | undefined);
  const title = $derived(playlistTitle(playlistId, account));
  const ro = $derived(setupReadOnly());

  let typed = $state("");
  let error = $state("");
  let pendingMode = $state<"allow" | "deny" | null>(null);

  function edit(): ChannelFilter {
    const s = ensureSetup(account);
    if (!s.filters[playlistId]) s.filters[playlistId] = { enabled: false, mode: "deny", channels: [] };
    return s.filters[playlistId];
  }

  function setMode(m: "allow" | "deny") {
    const f = edit();
    if (f.mode === m) return;
    if (f.channels.length) pendingMode = m;
    else f.mode = m;
  }

  function add() {
    const q = typed.trim().toLowerCase().replace(/^https?:\/\/(www\.)?youtube\.com\//, "").replace(/^@/, "");
    if (!q) return;
    const key = Object.keys(channels).find(
      (k) => channels[k].handle?.toLowerCase().replace(/^@/, "") === q || channels[k].title.toLowerCase() === q,
    );
    if (!key) {
      error = "That doesn't look like a channel. Try an @handle or a channel link.";
      return;
    }
    const f = edit();
    if (f.channels.includes(key)) {
      error = `${channels[key].title} is already listed.`;
      return;
    }
    f.channels.push(key);
    typed = "";
    error = "";
  }
</script>

<div class="w-80 space-y-3 text-sm">
  <div class="flex items-center justify-between gap-3">
    <div>
      <p class="font-medium">Channel filter for {title}</p>
      <p class="text-muted-foreground text-xs">Off lets every channel through, and keeps the list below.</p>
    </div>
    <Switch
      size="sm"
      disabled={ro}
      bind:checked={() => filter?.enabled ?? false, (v) => (edit().enabled = v)}
    />
  </div>

  <RadioGroup.Root
    value={filter?.mode ?? "deny"}
    onValueChange={(v) => setMode(v as "allow" | "deny")}
    disabled={ro}
    class={filter?.enabled ? "" : "opacity-60"}
  >
    <label class="flex items-start gap-2">
      <RadioGroup.Item value="allow" class="mt-0.5" />
      <span>Only listed channels <span class="text-muted-foreground">(allowlist)</span></span>
    </label>
    <label class="flex items-start gap-2">
      <RadioGroup.Item value="deny" class="mt-0.5" />
      <span>All except listed channels <span class="text-muted-foreground">(denylist)</span></span>
    </label>
  </RadioGroup.Root>

  {#if pendingMode}
    <div class="rounded-md bg-amber-500/10 p-2 text-xs">
      Changing the mode clears the {filter?.channels.length} listed channels.
      <div class="mt-1.5 flex gap-2">
        <Button
          size="xs"
          onclick={() => {
            const f = edit();
            f.mode = pendingMode!;
            f.channels = [];
            pendingMode = null;
          }}>Clear and change</Button
        >
        <Button size="xs" variant="ghost" onclick={() => (pendingMode = null)}>Keep</Button>
      </div>
    </div>
  {/if}

  <p class="text-muted-foreground text-xs">
    {#if (filter?.mode ?? "deny") === "allow"}
      Only videos from listed channels are auto-added to {title}.
    {:else}
      Videos from listed channels are never auto-added to {title}.
    {/if}
  </p>

  <div class="flex flex-wrap gap-1.5">
    {#each filter?.channels ?? [] as key (key)}
      <span class="bg-muted inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs">
        {channels[key]?.title ?? "Unknown channel"}
        {#if channels[key]?.handle}<span class="text-muted-foreground">{channels[key].handle}</span>{/if}
        <button
          type="button"
          class="hover:bg-background rounded-full p-0.5"
          aria-label="Remove {channels[key]?.title}"
          disabled={ro}
          onclick={() => {
            const f = edit();
            f.channels = f.channels.filter((c) => c !== key);
          }}><X class="size-3" /></button
        >
      </span>
    {:else}
      <span class="text-muted-foreground text-xs">No listed channels yet.</span>
    {/each}
  </div>

  {#if !ro}
    <div class="flex gap-2">
      <Input
        class="h-7 text-xs"
        placeholder="@handle or channel URL"
        bind:value={typed}
        onkeydown={(e) => e.key === "Enter" && add()}
      />
      <Button size="sm" variant="outline" onclick={add}>Add</Button>
    </div>
    {#if error}<p class="text-destructive text-xs">{error}</p>{/if}
    <p class="text-muted-foreground text-[11px]">Try @tinyscience, @loudreacts or "The Shed Workshop".</p>
  {/if}
</div>
