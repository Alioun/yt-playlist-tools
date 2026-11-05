<script lang="ts">
  import Toast from "../../../src/site/kit/toaster/Toast.svelte"
  import type { Toaster } from "../../../src/site/kit/toaster/model"
  let { source, document }: { source: Toaster; document: Document } = $props()
</script>
<Toast {source} {document} site="www" />
<Toast {source} {document} site="music" />
