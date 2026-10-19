<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). An inline YouTube Music icon.
  import { icons, type IconName } from "./icons";
  let { name, size = 24 }: { name: IconName; size?: number } = $props();
  const icon = $derived(icons[name]);
</script>

<svg viewBox={icon.vb} width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false"><path d={icon.d} /></svg>

<style>
  svg {
    display: block;
    flex: none;
    pointer-events: none;
  }
</style>
