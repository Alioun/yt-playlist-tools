<script lang="ts">
  import PlaylistChooser from "../../../../src/ui/picker/PlaylistChooser.svelte"
  import type { PlaylistChooserProps } from "../../../../src/ui/picker/types"
  import type { PickerModel } from "../../../../src/shared/picker/model.svelte"
  let { props, picker }: { props: PlaylistChooserProps; picker: PickerModel } = $props()
</script>
<PlaylistChooser {...props} {picker} />
