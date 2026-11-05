<script lang="ts">
  import KeyRecorder from "../../../src/ui/keys/KeyRecorder.svelte"
  import type { KeyRecorderController } from "../../../src/ui/keys/controller"
  import type { ShortcutTarget } from "../../../src/shared/keys"
  import { keyRecorderText } from "../../../src/ui/keys/text"
  import { englishI18n } from "../localization/scripted"
  const text = keyRecorderText(englishI18n())
  let { controller, title, targetName }: { controller: KeyRecorderController; title: string; targetName: (target: ShortcutTarget) => string } = $props()
</script>
<KeyRecorder {controller} {text} {title} {targetName} os="linux" browser="Chrome" />
