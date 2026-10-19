<script lang="ts">
  // An album page. Our Play next and Add to queue sit among YouTube Music's own header buttons,
  // left of its ⋮, always visible. Track rows get hover buttons, but no Like of ours (YouTube Music has its own there).
  import Play from "@lucide/svelte/icons/play";
  import LibraryBig from "@lucide/svelte/icons/library-big";
  import EllipsisVertical from "@lucide/svelte/icons/ellipsis-vertical";
  import { albums, thumb } from "$lib/data";
  import QuickButtons from "./QuickButtons.svelte";
  import SongRow from "./SongRow.svelte";
  import { songsOf } from "./actions";

  const album = albums[1];
  const tracks = songsOf(album);
  const plays = ["2.1M plays", "880K plays", "412K plays", "301K plays", "97K plays"];
</script>

<div class="px-6 pt-4 pb-8">
  <div class="flex items-end gap-8">
    <div class="size-56 shrink-0 rounded" style={thumb(album.hue)}></div>
    <div class="min-w-0 pb-2">
      <h1 class="text-4xl font-bold">{album.title}</h1>
      <p class="text-yt-muted mt-2 text-sm">{album.kind} • {album.artist} • {album.year}</p>
      <p class="text-yt-muted text-sm">{tracks.length} songs • 19 minutes</p>
      <div class="mt-5 flex items-center gap-3">
        <span class="flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-medium text-black" title="YouTube Music's own"
          ><Play class="size-4" fill="currentColor" /> Play</span
        >
        <span class="flex size-10 items-center justify-center rounded-full bg-white/10" title="YouTube Music's own Save to library"
          ><LibraryBig class="size-5" /></span
        >
        <QuickButtons item={{ kind: "album", album }} context="header" />
        <span class="flex size-10 items-center justify-center rounded-full bg-white/10" title="YouTube Music's own ⋮ menu"
          ><EllipsisVertical class="size-5" /></span
        >
      </div>
    </div>
  </div>
  <div class="mt-8">
    {#each tracks as s, i (s.id)}
      <SongRow song={s} index={i} numbered plays={plays[i % plays.length]} ownLike />
    {/each}
  </div>
</div>
