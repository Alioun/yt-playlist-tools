<script lang="ts">
  // A playlist's thumbnail (16:9). Watch later gets its clock; others a placeholder colour for the cached thumbnail.
  import Clock from "@lucide/svelte/icons/clock";
  import Unlink from "@lucide/svelte/icons/unlink";
  import type { PickerPlaylist } from "$shared/picker/model.svelte";
  let { playlist, size = "md" }: { playlist: PickerPlaylist; size?: "sm" | "md" } = $props();
</script>

<span
  class="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[5px] {size === 'sm' ? 'h-[18px] w-8' : 'h-[22px] w-10'}"
  style={playlist.id === "WL" || playlist.gone
    ? ""
    : `background-image:linear-gradient(135deg, oklch(0.64 0.12 ${playlist.hue}), oklch(0.42 0.11 ${(playlist.hue + 35) % 360}))`}
  class:bg-accent={playlist.id === "WL"}
  class:bg-muted={playlist.gone}
  aria-hidden="true"
>
  {#if playlist.id === "WL"}<Clock class="text-primary size-3.5" />{:else if playlist.gone}<Unlink class="text-muted-foreground size-3" />{/if}
  <span class="absolute inset-0 rounded-[5px] ring-1 ring-black/5 ring-inset dark:ring-white/10"></span>
</span>
