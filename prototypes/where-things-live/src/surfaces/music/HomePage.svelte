<script lang="ts">
  import { albums, songs } from "$lib/data";
  import AlbumCard from "./AlbumCard.svelte";
  import SongRow from "./SongRow.svelte";
  import { ui } from "./store.svelte";
</script>

<div class="space-y-8 px-6 pt-2 pb-8">
  <section>
    <p class="text-yt-muted text-xs tracking-wide uppercase">Alioun</p>
    <h2 class="mb-4 text-2xl font-bold">Listen again</h2>
    <div class="flex gap-5 overflow-x-auto pb-2">
      {#each albums as a (a.id)}
        <AlbumCard album={a} />
      {/each}
    </div>
  </section>
  <section>
    <p class="text-yt-muted text-xs tracking-wide uppercase">Start radio from a song</p>
    <h2 class="mb-3 text-2xl font-bold">Quick picks</h2>
    <div class="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
      {#each songs as s (s.id)}
        <SongRow song={s} />
      {/each}
    </div>
  </section>
  <button type="button" class="text-yt-muted text-xs underline" onclick={() => (ui.page = "album")}>Open the album "Small Fires"</button>
</div>
