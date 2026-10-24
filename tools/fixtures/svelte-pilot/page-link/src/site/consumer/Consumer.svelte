<script lang="ts">
  import { onMount as mounted, setContext, tick as settled } from "svelte"
  import { Badge } from "$kit"
  import { createCounter } from "./counter.svelte"
  const counter = createCounter()
  setContext("fixture", "Shared")
  mounted(() => { globalThis.__pp.kit.mounted++ })
  async function add() { counter.add(); await settled(); globalThis.__pp.kit.events++ }
</script>
<button class="counter" onclick={add}>Count {counter.value}</button>
{#if counter.value > 0}<p class="branch">Branch {counter.value}</p>{/if}
<Badge value={counter.value} onadd={add} />
<style>.counter { color: rgb(20, 80, 140); } .branch { font-weight: 700; }</style>
