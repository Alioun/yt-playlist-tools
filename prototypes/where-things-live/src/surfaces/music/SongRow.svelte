<script lang="ts">
  // A YouTube Music song row. Our buttons appear on hover or focus in the trailing area,
  // immediately left of YouTube Music's own like and ⋮, covering the duration but never the title.
  import { thumb, type Song } from "$lib/data";
  import { cn } from "$lib/utils";
  import QuickButtons from "./QuickButtons.svelte";
  import YtmOwnButtons from "./YtmOwnButtons.svelte";
  import { ui, slotWidth } from "./store.svelte";

  let {
    song,
    index = 0,
    numbered = false,
    plays = "",
    /** Album track rows: YouTube Music shows its own like there, so ours isn't drawn. */
    ownLike = false,
  }: { song: Song; index?: number; numbered?: boolean; plays?: string; ownLike?: boolean } = $props();
</script>

<!-- Focusable so keyboard focus reveals the row's buttons (ticket 26: hover or focus). -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="group relative flex h-14 items-center gap-3 rounded-md px-2 hover:bg-white/10 focus-within:bg-white/10"
  tabindex="0"
  role="group"
  aria-label={song.title}
>
  {#if numbered}
    <span class="text-yt-muted w-6 text-center text-sm">{index + 1}</span>
  {:else}
    <span class="size-10 shrink-0 rounded" style={thumb(song.hue)}></span>
  {/if}
  <div class="min-w-0 flex-1">
    <p class="truncate text-sm font-medium">{song.title}</p>
    {#if !numbered}<p class="text-yt-muted truncate text-xs">{song.artist} • {song.album}</p>{/if}
  </div>
  {#if plays}<span class="text-yt-muted hidden w-24 text-right text-xs xl:block">{plays}</span>{/if}
  <!-- trailing area: duration, replaced by our buttons on hover -->
  <span class="relative flex shrink-0 justify-end" style="width: {slotWidth('row', !ownLike)}px">
    <span class={cn("text-yt-muted text-xs group-hover:invisible group-focus-within:invisible", ui.showAll && "invisible")}
      >{song.duration}</span
    >
    <span
      class={cn(
        "invisible absolute top-1/2 right-0 -translate-y-1/2 group-hover:visible group-focus-within:visible",
        ui.showAll && "visible",
      )}
    >
      <QuickButtons item={{ kind: "song", song }} context="row" allowLike={!ownLike} class="bg-ytm-bg/90" />
    </span>
  </span>
  <YtmOwnButtons />
</div>
