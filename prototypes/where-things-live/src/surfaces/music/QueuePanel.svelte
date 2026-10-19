<script lang="ts">
  // YouTube Music's "Up next" queue panel. Queue items get only Save, Like and Remove from queue,
  // on hover, left of the item's ⋮. The playing item works the same: it's how the playing song gets its buttons.
  import AudioLines from "@lucide/svelte/icons/audio-lines";
  import { app } from "$lib/state.svelte";
  import { thumb } from "$lib/data";
  import { cn } from "$lib/utils";
  import QuickButtons from "./QuickButtons.svelte";
  import YtmOwnButtons from "./YtmOwnButtons.svelte";
  import { ui, slotWidth } from "./store.svelte";
  import { songById } from "./actions";
</script>

<div class="flex h-full min-h-0 flex-col">
  <div class="flex border-b border-white/10 text-sm">
    <span class="border-b-2 border-white px-4 py-3 font-medium">UP NEXT</span>
    <span class="text-yt-muted px-4 py-3">LYRICS</span>
    <span class="text-yt-muted px-4 py-3">RELATED</span>
  </div>
  {#if !ui.playerBar}
    <p class="mx-2 mt-2 rounded border border-dashed border-amber-400/60 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-200">
      Prototype note. No player bar: the playing song's actions are its queue item and the keys.
    </p>
  {/if}
  <div class="min-h-0 flex-1 overflow-auto py-2">
    {#each app.music.queue as id, i (`${id}-${i}`)}
      {@const s = songById(id)}
      {@const playing = i === app.music.queue.indexOf(app.music.nowPlaying)}
      <div class={cn("group flex h-14 items-center gap-3 rounded-md px-2 hover:bg-white/10 focus-within:bg-white/10", playing && "bg-white/10")}>
        <span class="relative size-10 shrink-0 rounded" style={thumb(s.hue)}>
          {#if playing}
            <span class="absolute inset-0 flex items-center justify-center rounded bg-black/50"><AudioLines class="size-4" /></span>
          {/if}
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{s.title}</p>
          <p class="text-yt-muted truncate text-xs">{s.artist}</p>
        </div>
        <span class="relative flex shrink-0 justify-end" style="width: {slotWidth('queue')}px">
          <span class={cn("text-yt-muted text-xs group-hover:invisible group-focus-within:invisible", ui.showAll && "invisible")}
            >{s.duration}</span
          >
          <span
            class={cn(
              "invisible absolute top-1/2 right-0 -translate-y-1/2 group-hover:visible group-focus-within:visible",
              ui.showAll && "visible",
            )}
          >
            <QuickButtons item={{ kind: "song", song: s }} context="queue" queueIndex={i} class="bg-ytm-raised/95" />
          </span>
        </span>
        <YtmOwnButtons like={false} />
      </div>
    {:else}
      <p class="text-yt-muted px-4 py-6 text-sm">The queue is empty. Play next or Add to queue start playback.</p>
    {/each}
  </div>
</div>
