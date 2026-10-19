<script lang="ts">
  // YouTube Music's OWN trailing buttons on a row (like and ⋮). Not ours: no ext-mark.
  import ThumbsUp from "@lucide/svelte/icons/thumbs-up";
  import EllipsisVertical from "@lucide/svelte/icons/ellipsis-vertical";
  let { like = true }: { like?: boolean } = $props();
</script>

<span class="text-yt-muted inline-flex shrink-0 items-center">
  {#if like}<span class="inline-flex size-8 items-center justify-center" title="YouTube Music's own like"><ThumbsUp class="size-4" /></span>{/if}
  <span class="inline-flex size-8 items-center justify-center" title="YouTube Music's own ⋮ menu"><EllipsisVertical class="size-4" /></span>
</span>
