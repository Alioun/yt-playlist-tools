<script lang="ts">
  let { d, size = 24 }: { d: string; size?: number } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" style="display:block;flex:none"
  ><path {d} /></svg
>
