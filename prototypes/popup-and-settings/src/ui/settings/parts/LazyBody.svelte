<script lang="ts">
  // A feature card's options, loaded on demand: the cards paint with the page, their options right after (ticket 24
  // keeps pickers, the recorder and Bits UI's floating layer out of the first frame). A quiet skeleton holds the
  // place for the few milliseconds it takes.
  import type { Component } from "svelte";
  let { load, lines = 3 }: { load: () => Promise<{ default: Component }>; lines?: number } = $props();
  let C = $state<Component | null>(null);
  $effect(() => {
    let live = true;
    load().then((m) => live && (C = m.default));
    return () => (live = false);
  });
</script>

{#if C}
  <C />
{:else}
  <div class="space-y-3 px-5 py-5" aria-busy="true">
    {#each Array.from({ length: lines }) as _, i (i)}
      <div class="bg-muted h-3 animate-pulse rounded-full" style="width:{[62, 88, 74, 54][i % 4]}%"></div>
    {/each}
  </div>
{/if}
