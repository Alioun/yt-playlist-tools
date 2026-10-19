<script lang="ts">
  // The now-playing view: big art on the left, YouTube Music's queue panel on the right.
  // Nothing of ours on the art or title: the playing song gets its actions from its queue item and the keys.
  import { app } from "$lib/state.svelte";
  import { thumb } from "$lib/data";
  import QueuePanel from "./QueuePanel.svelte";
  import { songById } from "./actions";

  const song = $derived(app.music.queue.length ? songById(app.music.nowPlaying) : null);
</script>

<div class="flex h-full min-h-0 gap-8 px-6 pt-2 pb-4">
  <div class="flex min-w-0 flex-1 flex-col items-center justify-center">
    {#if song}
      <div class="aspect-square w-full max-w-sm rounded-md shadow-2xl" style={thumb(song.hue)}></div>
      <p class="mt-5 text-xl font-semibold">{song.title}</p>
      <p class="text-yt-muted text-sm">{song.artist} • {song.album}</p>
    {:else}
      <p class="text-yt-muted">Nothing is playing.</p>
    {/if}
  </div>
  <div class="bg-ytm-bg w-[22rem] shrink-0">
    <QueuePanel />
  </div>
</div>
