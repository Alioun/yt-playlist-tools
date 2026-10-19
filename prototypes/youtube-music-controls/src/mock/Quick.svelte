<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). Wires the kit's cluster to the mock store for one item.
  import Cluster from "../kit/Cluster.svelte";
  import type { Place } from "../kit/model";
  import { itemFor, act, openPicker, preloadPicker, stateOf, clusterSettings, picker, songIdOf } from "./store.svelte";

  let { itemKey, place }: { itemKey: string; place: Place } = $props();
  const item = $derived(itemFor(itemKey));
  const s = $derived(clusterSettings());
</script>

{#if item}
  <span class="q" data-cluster={itemKey}>
    <Cluster
      {place}
      {item}
      settings={s}
      states={stateOf(itemKey)}
      pickerOpen={picker.open && picker.songId === songIdOf(itemKey)}
      onaction={(a, el) => act(itemKey, a, el)}
      onpicker={(el) => openPicker(itemKey, el, s.quickSave ? "normal" : "choose")}
      onintent={preloadPicker}
    />
  </span>
{/if}

<style>
  .q {
    display: inline-flex;
    flex: none;
  }
</style>
