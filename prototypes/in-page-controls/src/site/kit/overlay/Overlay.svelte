<script lang="ts">
  import type { Item } from "../../core/items-www";
  import type { OverlaySlot } from "./overlay.svelte";

  let { state }: { state: { slots: OverlaySlot[]; item: Item | null; row: boolean; small: boolean; rev: number } } = $props();
  const shown = $derived((state.rev, state.item ? state.slots.filter((s) => s.accepts(state.item!)) : []));
</script>

{#if state.item}
  <div class="stack" class:row={state.row || state.small}>
    {#each shown as s (s.id)}
      {@const C = s.component}
      <C item={state.item} />
    {/each}
  </div>
{/if}

<style>
  .stack {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .stack.row {
    flex-direction: row;
  }
</style>
