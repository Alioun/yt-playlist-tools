<script lang="ts">
  import PickerPanel from "../../../../src/ui/picker/PickerPanel.svelte"
  import type { PickerPanelProps } from "../../../../src/ui/picker/types"
  let { props }: { props: PickerPanelProps } = $props()
</script>
<PickerPanel {...props} onoutcome={(receipt: { ok: true }) => { void receipt }} />
