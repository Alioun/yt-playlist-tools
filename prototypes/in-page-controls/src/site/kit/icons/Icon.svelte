<script lang="ts">
  import { I, type IconName } from "./icons";
  let { name, size = 24 }: { name: IconName; size?: number } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false"
  ><path d={I[name]} fill-rule="evenodd" /></svg
>

<style>
  svg {
    display: block;
    flex: none;
    pointer-events: none;
  }
</style>
