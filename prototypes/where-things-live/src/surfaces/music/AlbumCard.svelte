<script lang="ts">
  // A YouTube Music card. On hover, our Play next and Add to queue sit along the bottom edge of the art,
  // beside YouTube Music's own round play button (bottom-right).
  import Play from "@lucide/svelte/icons/play";
  import { thumb, type Album } from "$lib/data";
  import { cn } from "$lib/utils";
  import QuickButtons from "./QuickButtons.svelte";
  import { ui } from "./store.svelte";

  let { album }: { album: Album } = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="group w-40 shrink-0" tabindex="0" role="group" aria-label={album.title}>
  <div class={cn("relative aspect-square overflow-hidden", album.kind === "Playlist" ? "rounded-md" : "rounded")} style={thumb(album.hue)}>
    <div
      class={cn(
        "invisible absolute inset-0 bg-gradient-to-t from-black/60 to-transparent group-hover:visible group-focus-within:visible",
        ui.showAll && "visible",
      )}
    >
      <span class="absolute right-2 bottom-2 flex size-9 items-center justify-center rounded-full bg-black/70 text-white" title="YouTube Music's own play button">
        <Play class="size-4" fill="currentColor" />
      </span>
      <span class="absolute bottom-2 left-2">
        <QuickButtons item={{ kind: "album", album }} context="card" />
      </span>
    </div>
  </div>
  <p class="mt-2 truncate text-sm font-medium">{album.title}</p>
  <p class="text-yt-muted truncate text-xs">{album.kind} • {album.artist}</p>
</div>
