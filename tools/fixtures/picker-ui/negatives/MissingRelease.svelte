<script lang="ts">
  import PlaylistChooser from "../../../../src/ui/picker/PlaylistChooser.svelte"
  import type { PlaylistChooserProps } from "../../../../src/ui/picker/types"
  let { props }: { props: Omit<PlaylistChooserProps, "onrelease"> } = $props()
</script>
<PlaylistChooser {...props} />
