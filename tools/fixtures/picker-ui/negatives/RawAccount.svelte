<script lang="ts">
  import PlaylistChooser from "../../../../src/ui/picker/PlaylistChooser.svelte"
  import type { PlaylistChooserProps } from "../../../../src/ui/picker/types"
  let { props }: { props: PlaylistChooserProps } = $props()
</script>
<PlaylistChooser {...props} context={{ ...props.context, account: "unvalidated" }} />
