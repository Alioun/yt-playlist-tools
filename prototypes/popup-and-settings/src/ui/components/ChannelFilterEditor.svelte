<script lang="ts" module>
  import type { ChannelFilter } from "$shared/model/types";
  /** The pill on a ticked auto-add playlist. The same words as the editor's modes (1.5.0's pill said "Allow" where
   *  the editor said "Allow only", a Friction item). */
  export function filterSummary(f: ChannelFilter | undefined): string | null {
    if (!f) return null;
    if (f.on) return `${f.mode === "allow" ? "Allow only" : "Deny"} · ${f.channels.length}`;
    return f.channels.length ? `All channels · ${f.channels.length} kept` : null;
  }
</script>

<script lang="ts">
  // One auto-add playlist's channel filter (the channel-filters spec, glossary terms): a switch, Allow only / Deny,
  // the listed channels, a typed @handle or link (resolved by YouTube, /c/ links included now), and "this video's
  // channel". Changing mode with channels listed asks first, because it clears the list. Off keeps mode and list.
  import X from "@lucide/svelte/icons/x";
  import Plus from "@lucide/svelte/icons/plus";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import { Switch } from "$ui/components/ui/switch/index.js";
  import { Button } from "$ui/components/ui/button/index.js";
  import type { AccountId } from "$shared/model/types";
  import { act, call, setupOf, setupsReadOnly, syncLine, titleOf, ui } from "$lib/view.svelte";

  let { acct, playlist }: { acct: AccountId; playlist: string } = $props();

  const f = $derived<ChannelFilter>(setupOf(acct)?.filters[playlist] ?? { on: false, mode: "deny", channels: [] });
  const readOnly = $derived(setupsReadOnly());
  let labels = $state<Record<string, { title: string; handle?: string; hue: number }>>({});
  let input = $state("");
  let resolving = $state(false);
  let error = $state("");
  let confirm = $state<null | { mode: "allow" | "deny"; turnOn: boolean; add?: string }>(null);
  const videoChannel = $derived(ui.tab.state === "ready" ? (ui.tab.video?.channel ?? null) : null);

  $effect(() => {
    for (const id of [...f.channels, ...(videoChannel ? [videoChannel] : [])])
      if (!labels[id]) call("channel", { id }).then((c) => c && (labels[id] = c));
  });

  async function write(next: ChannelFilter) {
    error = "";
    const r = await act({ kind: "filter", acct, playlist, filter: next });
    if (!r.ok) error = r.refused === "sync-full" ? (syncLine()?.text ?? "Synced settings are full.") : r.refused === "private" ? "Private windows don't save changes." : "Couldn't save that.";
    return r.ok;
  }
  function setMode(mode: "allow" | "deny") {
    if (mode === f.mode) return;
    if (f.channels.length) confirm = { mode, turnOn: false };
    else write({ ...f, mode });
  }
  function toggle(on: boolean) {
    write({ ...f, on });
  }
  async function add(id: string) {
    if (f.channels.includes(id)) return;
    await write({ ...f, on: true, channels: [...f.channels, id] });
  }
  async function addTyped(e: SubmitEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    resolving = true;
    error = "";
    const r = await call("resolveChannel", { input });
    resolving = false;
    if ("error" in r) {
      error = r.error;
      return;
    }
    labels[r.id] = { title: r.title, handle: r.handle, hue: 200 };
    if (f.channels.includes(r.id)) {
      error = `${r.title} is already listed.`;
      return;
    }
    await add(r.id);
    input = "";
  }
</script>

<div class="space-y-2.5">
  <div class="flex items-center gap-2">
    <span class="flex-1 text-xs font-medium">Channel filter</span>
    <Switch size="sm" checked={f.on} disabled={readOnly} aria-label="Channel filter for {titleOf(playlist)}" onCheckedChange={toggle} />
  </div>

  {#if f.on}
    <div class="bg-muted grid grid-cols-2 gap-0.5 rounded-lg p-0.5" role="radiogroup" aria-label="Filter mode">
      {#each [["allow", "Allow only"], ["deny", "Deny"]] as [m, label] (m)}
        <button
          type="button"
          role="radio"
          aria-checked={f.mode === m}
          disabled={readOnly}
          class="h-7 rounded-md text-xs font-medium transition-colors {f.mode === m ? 'bg-card text-foreground shadow-soft dark:bg-secondary' : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => setMode(m as "allow" | "deny")}>{label}</button
        >
      {/each}
    </div>
    <p class="text-muted-foreground text-[11.5px] leading-4">
      {f.mode === "allow" ? "Only videos from these channels are auto-added." : "Videos from these channels are never auto-added."}
    </p>
  {:else if f.channels.length}
    <p class="text-muted-foreground text-[11.5px] leading-4">
      Off: every channel gets in. Its {f.channels.length}
      {f.mode === "allow" ? "allowed" : "denied"} channel{f.channels.length === 1 ? " is" : "s are"} kept for when you turn it back on.
    </p>
  {/if}

  {#if confirm}
    <div class="border-warning-border bg-warning-soft rounded-lg border px-2.5 py-2 text-[12px]" role="alert">
      Switch to {confirm.mode === "allow" ? "Allow only" : "Deny"}? This clears its {f.channels.length}
      {f.mode === "allow" ? "allowed" : "denied"} channel{f.channels.length === 1 ? "" : "s"}.
      <div class="mt-1.5 flex gap-1.5">
        <Button
          size="xs"
          onclick={() => {
            write({ on: true, mode: confirm!.mode, channels: [] });
            confirm = null;
          }}>Switch and clear</Button
        >
        <Button size="xs" variant="outline" onclick={() => (confirm = null)}>Cancel</Button>
      </div>
    </div>
  {/if}

  {#if f.on}
    {#if f.channels.length}
      <ul class="flex flex-wrap gap-1.5" aria-label="Listed channels">
        {#each f.channels as id (id)}
          {@const c = labels[id]}
          <li class="bg-card inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border pr-1 pl-1 text-xs">
            <span
              class="size-5 shrink-0 rounded-full"
              style="background-image:linear-gradient(135deg, oklch(0.66 0.11 {c?.hue ?? 250}), oklch(0.48 0.1 {(c?.hue ?? 250) + 30}))"
              aria-hidden="true"
            ></span>
            <span class="min-w-0 truncate"
              >{c?.title ?? "…"}{#if c?.handle}<span class="text-muted-foreground">{` · ${c.handle}`}</span>{/if}</span
            >
            {#if !readOnly}
              <button
                type="button"
                class="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-5 shrink-0 items-center justify-center rounded-full"
                aria-label="Remove {c?.title ?? 'channel'}"
                onclick={() => write({ ...f, channels: f.channels.filter((x) => x !== id) })}><X class="size-3" /></button
              >
            {/if}
          </li>
        {/each}
      </ul>
    {:else if f.mode === "allow"}
      <p class="text-warning flex items-start gap-1 text-[11.5px] leading-4">
        <TriangleAlert class="mt-px size-3 shrink-0" />With no channels listed, nothing is auto-added to {titleOf(playlist)}.
      </p>
    {/if}

    {#if !readOnly}
      {#if videoChannel && !f.channels.includes(videoChannel) && labels[videoChannel]}
        <Button size="xs" variant="outline" onclick={() => add(videoChannel!)}>
          <Plus />{f.mode === "allow" ? "Allow" : "Deny"}
          {labels[videoChannel].title} (this video)
        </Button>
      {/if}
      <form class="flex gap-1.5" onsubmit={addTyped}>
        <input
          class="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 h-7 min-w-0 flex-1 rounded-lg border px-2 text-xs outline-none focus-visible:ring-3"
          placeholder="@handle or channel link"
          aria-label="Add a channel by its @handle or link"
          bind:value={input}
        />
        <Button size="sm" variant="secondary" type="submit" disabled={!input.trim() || resolving}>
          {#if resolving}<LoaderCircle class="animate-spin" />{/if}Add
        </Button>
      </form>
    {/if}
  {/if}
  {#if error}<p class="text-destructive text-[11.5px] leading-4" role="alert">{error}</p>{/if}
</div>
