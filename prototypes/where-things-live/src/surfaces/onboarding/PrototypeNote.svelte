<script lang="ts">
  // Prototype chrome above a surface (not part of the design being evaluated).
  import type { Snippet } from "svelte";
  let { children }: { children: Snippet } = $props();
</script>

<div class="flex flex-wrap items-center gap-2 px-1 pb-2 text-xs text-zinc-500">
  <span class="rounded bg-yellow-300 px-1 py-0.5 text-[10px] font-bold text-black">PROTOTYPE</span>
  {@render children()}
</div>
