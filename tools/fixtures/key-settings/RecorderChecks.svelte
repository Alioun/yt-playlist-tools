<script lang="ts">
  import KeyRecorder from "../../../src/ui/keys/KeyRecorder.svelte"
  import type { KeyRecorderController } from "../../../src/ui/keys/controller"
  import type { ShortcutTarget } from "../../../src/shared/keys"
  let { controller, title, targetName }: { controller: KeyRecorderController; title: string; targetName: (target: ShortcutTarget) => string } = $props()
</script>
<KeyRecorder {controller} {title} {targetName} os="linux" browser="Chrome" />
