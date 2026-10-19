<script lang="ts">
  // popovers.js carries its own Svelte copy, so it can't nest the kit's Icon component; it draws the kit's icon paths.
  let { d, size = 24 }: { d: string; size?: number } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false"
  ><path {d} fill-rule="evenodd" /></svg
>

<style>
  svg {
    display: block;
    flex: none;
  }
</style>
