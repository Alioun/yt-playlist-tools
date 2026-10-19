<script lang="ts">
  // A small heading inside a feature card, with an optional count or note on the right.
  import type { Snippet } from "svelte";
  let { title, aside, children }: { title: string; aside?: string; children?: Snippet } = $props();
</script>

<div class="flex items-end justify-between gap-3 px-5 pt-4 pb-2">
  <h4 class="text-muted-foreground text-[11.5px] font-semibold tracking-[0.06em] uppercase">{title}</h4>
  {#if children}{@render children()}{:else if aside}<span class="text-muted-foreground text-xs">{aside}</span>{/if}
</div>
