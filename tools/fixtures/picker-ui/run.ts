import { cleanup, fireEvent, render } from "@testing-library/svelte"
import { flushSync } from "svelte"
import { PickerModel } from "../../../src/shared/picker/model.svelte"
import type { Mode } from "../../../src/shared/picker/model.svelte"
import PickerPanel from "../../../src/ui/picker/PickerPanel.svelte"
import { createPickerText } from "../../../src/ui/picker/text"
import { englishI18n } from "../localization/scripted"
import { chooserSource, itemSource, NOW, playlist, settle } from "../picker-model/fake-source"
import type { PickerEvent } from "../../../src/ui/picker/types"

const text = createPickerText(englishI18n())
const alpha = playlist("PLalpha")
for (const mode of ["save", "choose", "many"] satisfies Mode[]) {
  const fixture = mode === "save" ? itemSource() : chooserSource()
  const picker =
    mode === "save"
      ? new PickerModel({ source: itemSourceForSave(), site: "www", mode })
      : mode === "many"
        ? new PickerModel({ source: chooserForMany(), site: "www", mode })
        : new PickerModel({ source: fixture.source, site: "www", mode })
  function itemSourceForSave() {
    if (fixture.source.item === null) throw new Error("Synthetic save requires an item")
    return { ...fixture.source, item: fixture.source.item }
  }
  function chooserForMany() {
    if (fixture.source.item !== null) throw new Error("Synthetic many forbids an item")
    return { ...fixture.source, item: null }
  }
  const events: PickerEvent[] = []
  const view = render(PickerPanel, { picker, text, purpose: { kind: "save" }, platform: "linux", onoutcome: (event: PickerEvent) => events.push(event), onrequestclose: () => {} })
  fixture.ledger.answer("cachedList", { rows: [{ id: alpha, title: "Synthetic Alpha" }], at: NOW })
  await settle()
  flushSync()
  const search = view.getByRole("searchbox")
  await fireEvent.keyDown(search, { key: "Enter" })
  if (mode === "save") fixture.ledger.answer("add", { kind: "failed" })
  else fixture.ledger.answer("choose", { refused: "sync-full" })
  await settle()
  flushSync()
  process.stdout.write(JSON.stringify({ synthetic: true, mode, searchFocused: document.activeElement === search, checked: view.getByRole("checkbox").getAttribute("aria-checked"), events }) + "\n")
  picker.close()
  cleanup()
}
