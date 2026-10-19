<script lang="ts">
  // YouTube Music's classic player bar. The only thing of ours here is the opt-in Save split button,
  // immediately left of YouTube Music's own like. Nothing else depends on the bar (ticket 26).
  import SkipBack from "@lucide/svelte/icons/skip-back";
  import SkipForward from "@lucide/svelte/icons/skip-forward";
  import Pause from "@lucide/svelte/icons/pause";
  import ThumbsUp from "@lucide/svelte/icons/thumbs-up";
  import ThumbsDown from "@lucide/svelte/icons/thumbs-down";
  import EllipsisVertical from "@lucide/svelte/icons/ellipsis-vertical";
  import Volume2 from "@lucide/svelte/icons/volume-2";
  import Repeat from "@lucide/svelte/icons/repeat";
  import Shuffle from "@lucide/svelte/icons/shuffle";
  import { app } from "$lib/state.svelte";
  import { thumb } from "$lib/data";
  import SaveSplit from "./SaveSplit.svelte";
  import { playerBarSaveOn, ui } from "./store.svelte";
  import { songById } from "./actions";

  const song = $derived(app.music.queue.length ? songById(app.music.nowPlaying) : null);
</script>

<div class="bg-ytm-raised relative shrink-0 border-t border-white/5">
  <div class="absolute -top-0.5 right-0 left-0 h-0.5 bg-white/20"><div class="h-full w-1/3 bg-red-600"></div></div>
  <div class="flex h-16 items-center gap-4 px-4">
    <div class="flex items-center gap-3 text-white">
      <SkipBack class="size-5" fill="currentColor" />
      <Pause class="size-7" fill="currentColor" />
      <SkipForward class="size-5" fill="currentColor" />
      <span class="text-yt-muted text-xs">1:24 / {song?.duration ?? "0:00"}</span>
    </div>
    <div class="flex min-w-0 flex-1 items-center justify-center gap-3">
      {#if song}
        <button type="button" class="size-10 shrink-0 rounded" style={thumb(song.hue)} onclick={() => (ui.page = "playing")} aria-label="Open the player"></button>
        <div class="min-w-0">
          <p class="truncate text-sm font-medium">{song.title}</p>
          <p class="text-yt-muted truncate text-xs">{song.artist} • {song.album}</p>
        </div>
        {#if playerBarSaveOn()}
          <span class="ext-mark rounded-full"><SaveSplit {song} busyKey="bar-save" variant="bar" /></span>
        {/if}
        <span class="text-yt-muted flex items-center" title="YouTube Music's own like, dislike and ⋮">
          <span class="inline-flex size-8 items-center justify-center"
            ><ThumbsDown class="size-4" /></span
          ><span class="inline-flex size-8 items-center justify-center"
            ><ThumbsUp class="size-4" fill={app.music.liked.includes(song.id) ? "currentColor" : "none"} /></span
          ><span class="inline-flex size-8 items-center justify-center"><EllipsisVertical class="size-4" /></span>
        </span>
      {:else}
        <p class="text-yt-muted text-sm">Nothing playing</p>
      {/if}
    </div>
    <div class="text-yt-muted flex items-center gap-3">
      <Volume2 class="size-4" /><Repeat class="size-4" /><Shuffle class="size-4" />
    </div>
  </div>
</div>
