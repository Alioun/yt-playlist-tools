<script lang="ts">
  // Save to playlist as a split button (ticket 26): the main part saves to the quick-save playlist
  // in one click (or opens choose mode), the ▾ part opens the picker.
  import ListPlus from "@lucide/svelte/icons/list-plus";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import Check from "@lucide/svelte/icons/check";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import { app, tabSetup, playlistTitle } from "$lib/state.svelte";
  import type { Song } from "$lib/data";
  import { cn } from "$lib/utils";
  import { ui } from "./store.svelte";
  import { save, openSavePicker } from "./actions";

  let {
    song,
    busyKey,
    variant = "row",
  }: { song: Song; busyKey: string; variant?: "row" | "bar" } = $props();

  let el: HTMLElement | null = $state(null);
  const target = $derived(tabSetup()?.musicQuickSave ?? null);
  const key = $derived(app.features.musicShortcuts.on ? ` (${app.features.musicShortcuts.keys.save})` : "");
  const mainLabel = $derived(target ? `Save to ${playlistTitle(target)}${key}` : `Save to playlist…${key}`);
  const status = $derived(ui.busy[busyKey]);
</script>

<span
  bind:this={el}
  class={cn(
    "inline-flex shrink-0 items-center rounded-full",
    variant === "row" ? "text-yt-text" : "bg-white/10 text-white",
  )}
>
  <button
    type="button"
    title={mainLabel}
    aria-label={`${mainLabel}: ${song.title}`}
    class={cn(
      "inline-flex items-center gap-1 rounded-l-full hover:bg-white/10",
      variant === "row" ? "h-8 pr-0.5 pl-2" : "h-8 pr-1 pl-3 text-xs font-medium",
    )}
    onclick={(e) => {
      e.stopPropagation();
      save(song, "click", el, busyKey);
    }}
  >
    {#if status === "busy"}<LoaderCircle class="size-4 animate-spin" />
    {:else if status === "done"}<Check class="size-4" />
    {:else if status === "failed"}<CircleAlert class="size-4 text-red-400" />
    {:else}<ListPlus class="size-4" />{/if}
    {#if variant === "bar"}{target ? "Save" : "Save to playlist…"}{/if}
  </button>
  <button
    type="button"
    title="Save to playlist…"
    aria-label={`Choose a playlist for ${song.title}`}
    class={cn("inline-flex h-8 items-center rounded-r-full hover:bg-white/10", variant === "row" ? "pr-1.5 pl-0.5" : "pr-2 pl-1")}
    onclick={(e) => {
      e.stopPropagation();
      openSavePicker(song, el);
    }}
  >
    <ChevronDown class="size-3.5" />
  </button>
</span>
