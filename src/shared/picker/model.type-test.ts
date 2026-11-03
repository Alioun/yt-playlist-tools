import type { PlaylistId } from "../model"
import { PickerModel, type Mode, type PickerRow, type TickOutcome, type UntickOutcome } from "./model.svelte"
import type { ItemPort, PickerSource, Undo } from "./source"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Check<T extends true> = T

declare const itemSource: PickerSource<ItemPort>
declare const chooserSource: PickerSource<null>

export type PickerProofs = [
  Check<Equal<PickerModel["mode"], Mode>>,
  Check<Equal<PickerRow["check"], "on" | "off" | "loading">>,
  Check<Equal<Awaited<ReturnType<PickerModel["tick"]>>, TickOutcome>>,
  Check<Equal<Extract<UntickOutcome, { kind: "removed" }>["undo"], Undo>>,
  Check<Equal<Parameters<PickerSource["choose"]>, [id: PlaylistId, on: boolean]>>
]

function boundaries(picker: PickerModel) {
  new PickerModel({ source: itemSource, site: "www", mode: "save" })
  new PickerModel({ source: itemSource, site: "music", mode: "choose" })
  new PickerModel({ source: chooserSource, site: "www", mode: "choose" })
  new PickerModel({ source: chooserSource, site: "www", mode: "many" })
  picker.query = "mix"
  picker.form.title = "Focus"
  // @ts-expect-error Save mode needs an item to save.
  new PickerModel({ source: chooserSource, site: "www", mode: "save" })
  // @ts-expect-error The auto-add list has no item.
  new PickerModel({ source: itemSource, site: "www", mode: "many" })
  // @ts-expect-error Sites are www and music.
  new PickerModel({ source: itemSource, site: "youtube", mode: "save" })
  // @ts-expect-error Modes are save, choose and many.
  new PickerModel({ source: itemSource, site: "www", mode: "pick" })
  // @ts-expect-error Ticks take a branded playlist ID.
  void picker.tick("WL")
  // @ts-expect-error Visibility uses YouTube's upper-case values.
  void picker.create("Focus", "private")
  // @ts-expect-error Rows are a read-only view.
  picker.rows[0]!.check = "on"
  // @ts-expect-error The row list cannot grow.
  picker.rows.push(picker.rows[0]!)
  // @ts-expect-error Membership is derived from the source.
  picker.membership = { kind: "none" }
  // @ts-expect-error Sort A-Z changes through setSortAZ, which saves it.
  picker.sortAZ = true
  // @ts-expect-error A chooser source has no item to read membership for.
  void chooserSource.item.membership()
}
void boundaries
