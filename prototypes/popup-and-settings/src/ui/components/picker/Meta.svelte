<script lang="ts">
  // A playlist's second line: visibility and size, or that it's brand new and not listed by YouTube yet (ticket 12).
  import Lock from "@lucide/svelte/icons/lock";
  import Link from "@lucide/svelte/icons/link";
  import Globe from "@lucide/svelte/icons/globe";
  import type { PickerPlaylist } from "$shared/picker/model.svelte";
  let { playlist, unit = "video" }: { playlist: PickerPlaylist; unit?: "video" | "song" } = $props();
  const Icon = $derived({ private: Lock, unlisted: Link, public: Globe }[playlist.privacy]);
  const n = $derived(playlist.count);
</script>

<span class="text-muted-foreground flex min-w-0 items-center gap-1 text-[11.5px] leading-4">
  {#if playlist.gone}
    <span class="truncate">No longer on YouTube, or not this account's</span>
  {:else}
  <Icon class="size-3 shrink-0" />
  <span class="truncate">
    {playlist.privacy[0].toUpperCase() + playlist.privacy.slice(1)}
    · {#if playlist.fresh}New, YouTube lists it soon{:else}{n.toLocaleString("en")} {unit}{n === 1 ? "" : "s"}{/if}
  </span>
  {/if}
</span>
