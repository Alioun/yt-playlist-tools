import { decodeSettings, isShortcutId, type Settings, type ShortcutId, type AccountKey } from "../../shared/model"
import { display, type ShortcutTarget, type Platform } from "../../shared/keys"
import type { Backend } from "../backend/backend"
import type { KeySettingChange, KeySettingAnswer } from "../../shared/contracts/key-settings"
import { createKeyRecorderController, type CommandKeys, type KeyRecorderController } from "./controller"
import { keyForWire } from "../../shared/contracts/key-settings-fields"
import type { KeyRecorderText } from "./text"

export type ShortcutChooser = { open(input: { readonly shortcut: ShortcutId }): Promise<void> }
export type ShortcutTitles = { readonly account: AccountKey; readonly titles: ReadonlyMap<ShortcutId, string> }
export function createKeySettingsClient(input: {
  readonly backend: Backend
  readonly platform: Platform
  readonly commands: CommandKeys
  readonly chooser: ShortcutChooser
  readonly text: KeyRecorderText
}) {
  let active = true
  const controllers = new Set<KeyRecorderController>()
  function settings(): Settings {
    const read = input.backend.keys.read()
    if (!active || read.kind !== "value") throw Error("Current canonical key settings are unavailable")
    return decodeSettings(read.settings)
  }
  const unsubscribe = input.backend.keys.subscribe(snapshot => {
    if (!active) return
    for (const controller of controllers) {
      if (snapshot.kind === "value") controller.refresh()
      else controller.dispatch({ kind: "close" })
    }
  })
  async function send(change: KeySettingChange): Promise<KeySettingAnswer> {
    if (!active) return { kind: "refused", reason: "unavailable" }
    const answer = await input.backend.change(change)
    if (answer.kind === "confirmed" || answer.kind === "added" || answer.kind === "removed") await input.backend.keys.load()
    return active ? answer : { kind: "refused", reason: "unavailable" }
  }
  function recorder(target: ShortcutTarget, chooseAfterCommit = false): KeyRecorderController {
    let choose = chooseAfterCommit
    const controller = createKeyRecorderController({
      target,
      platform: input.platform,
      commands: input.commands,
      text: input.text,
      settings,
      send,
      async committed() {
        if (!choose || !active || target.kind !== "playlist" || !isShortcutId(target.id)) return
        choose = false
        await input.chooser.open({ shortcut: target.id })
      }
    })
    controllers.add(controller)
    return controller
  }
  return {
    ready: input.backend.keys.load(),
    settings,
    recorder,
    send,
    async add() {
      const answer = await send({ kind: "shortcut-add" })
      if (answer.kind !== "added") return { kind: "answer", answer } as const
      const controller = recorder({ kind: "playlist", id: answer.id }, true)
      controller.dispatch({ kind: "start" })
      return { kind: "recording", id: answer.id, controller } as const
    },
    label(id: ShortcutId, value: string) {
      const row = settings().shortcuts.list.find(row => row.id === id)
      return row ? send({ kind: "shortcut-label", id, expected: row.label, value }) : Promise.resolve({ kind: "refused", reason: "missing-target" } satisfies KeySettingAnswer)
    },
    watchLater(id: ShortcutId, value: boolean) {
      const row = settings().shortcuts.list.find(row => row.id === id)
      return row ? send({ kind: "shortcut-watch-later", id, expected: row.watchLaterOnEveryAccount, value }) : Promise.resolve({ kind: "refused", reason: "missing-target" } satisfies KeySettingAnswer)
    },
    remove(id: ShortcutId) {
      const row = settings().shortcuts.list.find(row => row.id === id)
      return row
        ? send({ kind: "shortcut-remove", id, expected: { id: row.id, key: keyForWire(row.key), label: row.label, watchLaterOnEveryAccount: row.watchLaterOnEveryAccount } })
        : Promise.resolve({ kind: "refused", reason: "missing-target" } satisfies KeySettingAnswer)
    },
    undo(receipt: string) {
      return send({ kind: "shortcut-undo", receipt })
    },
    name(id: ShortcutId, account: AccountKey, context: ShortcutTitles): string {
      const row = settings().shortcuts.list.find(row => row.id === id)
      return row?.label || (context.account === account ? context.titles.get(id) : undefined) || (row?.key ? display(row.key, input.platform.os) : input.text.noKey)
    },
    dispose() {
      if (!active) return
      active = false
      unsubscribe()
      for (const controller of controllers) controller.dispose()
      controllers.clear()
    }
  }
}
