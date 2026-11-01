<script lang="ts">
  import { onDestroy, untrack } from "svelte"
  let { label, destroyed, acquired }: { label: string; destroyed: () => void; acquired?: () => void } = $props()
  onDestroy(() => destroyed())
  untrack(() => acquired?.())
</script>
<button>{label}</button>
