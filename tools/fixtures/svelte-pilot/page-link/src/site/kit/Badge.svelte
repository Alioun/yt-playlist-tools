<script lang="ts">
  import { getContext } from "svelte"
  let { value, onadd }: { value: number; onadd: () => void } = $props()
  const label = getContext<string>("fixture")
</script>
<button class="badge" onclick={onadd}>{label} kit {value}</button>
<style>.badge { color: rgb(70, 20, 110); }</style>
