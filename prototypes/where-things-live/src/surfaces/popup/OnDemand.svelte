<script lang="ts">
  // Ticket 24: anything past the first view (pickers, shortcut rows, the full This video card) loads on demand.
  // A ~150 ms skeleton stands in for that load, so the prototype shows where the cost is paid.
  import type { Snippet } from "svelte";

  let { children, lines = 2, delay = 150 }: { children: Snippet; lines?: number; delay?: number } = $props();
  let ready = $state(false);
  $effect(() => {
    const t = setTimeout(() => (ready = true), delay);
    return () => clearTimeout(t);
  });
</script>

{#if ready}
  {@render children()}
{:else}
  <div class="space-y-1.5 py-0.5" aria-busy="true" aria-label="Loading">
    {#each Array(lines) as _, i (i)}
      <div class="bg-muted h-3 animate-pulse rounded" style="width: {90 - i * 20}%"></div>
    {/each}
  </div>
{/if}
