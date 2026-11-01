<script lang="ts">
  import type { ComponentProps } from "svelte"
  import { PickerModel } from "../../../src/shared/picker/model.svelte"
  import { PickerPanel, PlaylistChooser, createPickerText } from "../../../src/ui/picker"
  import type { PickerPanelProps, PlaylistChooserProps, PickerEvent } from "../../../src/ui/picker"
  import { englishI18n } from "../localization/scripted"
  import { chooserSource, itemSource } from "../picker-model/fake-source"
  import { chooserContext } from "./scenarios"

  const text = createPickerText(englishI18n())
  const save = new PickerModel({ source: itemSource().source, mode: "save", site: "www" })
  const choose = new PickerModel({ source: chooserSource().source, mode: "choose", site: "www" })
  const many = new PickerModel({ source: chooserSource().source, mode: "many", site: "www" })
  function onoutcome(event: PickerEvent) {
    switch (event.kind) {
      case "tick": if (event.outcome.kind === "picked") void event.outcome.choice; break
      case "untick": if (event.outcome.kind === "removed") void event.outcome.undo; break
      case "undo": if (event.outcome.kind === "failed") void event.id; break
      case "pin": case "refresh": case "sort": case "create": void event.outcome; break
      default: { const exhaustive: never = event; return exhaustive }
    }
  }
  const panel = { picker: save, text, purpose: { kind: "save" }, platform: "linux", onoutcome, onrequestclose: () => {} } satisfies PickerPanelProps
  const chooser = {
    open: false, context: chooserContext(), current: { kind: "none" }, label: "Synthetic localized label",
    availability: { kind: "available" }, createSource: () => chooserSource().source, text, platform: "linux",
    onrequest: () => {}, onoutcome, onrelease: event => event.picker.close()
  } satisfies PlaylistChooserProps
  const checkedPanel: ComponentProps<typeof PickerPanel> = panel
  const checkedChooser: ComponentProps<typeof PlaylistChooser> = chooser
</script>

<PickerPanel {...checkedPanel} />
<PickerPanel {...panel} picker={choose} purpose={{ kind: "quickSave" }} />
<PickerPanel {...panel} picker={many} purpose={{ kind: "many" }} />
<PlaylistChooser {...checkedChooser} />
