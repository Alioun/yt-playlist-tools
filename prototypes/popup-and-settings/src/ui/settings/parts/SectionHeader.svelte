<script lang="ts">
  import type { Snippet } from "svelte";
  let { title, description, children }: { title: string; description?: string; children?: Snippet } = $props();
</script>

<div class="mb-6 flex items-start gap-6">
  <div class="min-w-0 flex-1">
    <h1 class="text-[26px] leading-8 font-semibold tracking-[-0.02em]">{title}</h1>
    {#if description}<p class="text-muted-foreground mt-1.5 max-w-[64ch] text-[14.5px] leading-6">{description}</p>{/if}
  </div>
  {#if children}<div class="shrink-0 pt-1">{@render children()}</div>{/if}
</div>
