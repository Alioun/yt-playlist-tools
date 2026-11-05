import { decodeSettings, type Key, type Settings } from "../../shared/model"
import {
  recorder,
  display,
  displayModifiers,
  shortcutWarnings,
  type RecorderState,
  type RecorderEvent,
  type ShortcutTarget,
  type Platform,
  type BrowserCommand,
  type ShortcutWarning
} from "../../shared/keys"
import { keyAt, keyForWire, conflictObservations } from "../../shared/contracts/key-settings-fields"
import type { ConflictObservation, KeyAssignmentChange, KeySettingChange, KeySettingAnswer } from "../../shared/contracts/key-settings"
import type { KeyRecorderText } from "./text"

export type CommandKeys = { read(): Promise<{ readonly kind: "available"; readonly keys: readonly BrowserCommand[] } | { readonly kind: "unavailable" }> }
export type RecorderView = {
  readonly recorder: RecorderState
  readonly busy: boolean
  readonly label: string
  readonly hint: string
  readonly conflict: { readonly candidate: Readonly<Key>; readonly observations: readonly ConflictObservation[] } | undefined
  readonly warnings: readonly ShortcutWarning[]
  readonly commands: "loading" | "available" | "unavailable"
  readonly answer: KeySettingAnswer | undefined
}
export type KeyRecorderController = ReturnType<typeof createKeyRecorderController>
export function createKeyRecorderController(input: {
  readonly target: ShortcutTarget
  readonly platform: Platform
  readonly commands: CommandKeys
  readonly text: KeyRecorderText
  readonly settings: () => Readonly<Settings>
  readonly send: (change: KeySettingChange) => Promise<KeySettingAnswer>
  readonly committed?: () => Promise<void>
}) {
  let current = decodeSettings(input.settings()),
    expected = keyAt(current, input.target) ?? null
  let state: RecorderState = { kind: "idle", key: expected }
  let busy = false,
    active = true,
    revision = 0
  let answer: KeySettingAnswer | undefined, commands: readonly BrowserCommand[] | undefined
  let commandStatus: RecorderView["commands"] = "loading"
  let conflict: RecorderView["conflict"]
  const listeners = new Set<(view: RecorderView) => void>()
  function view(): RecorderView {
    const held = state.kind === "recording" ? displayModifiers(state.modifiers, input.platform.os) : ""
    const label =
      state.kind === "recording" ? (held ? `${held}${input.platform.os === "macos" ? "" : "+"}…` : input.text.pressKeys) : state.key ? display(state.key, input.platform.os) : input.text.noKey
    const hint = state.kind !== "recording" ? "" : state.refusal ? input.text.refusal(state.refusal) : input.text.escToCancel
    const sites =
      input.target.kind === "picker"
        ? (["www"] satisfies readonly ("www" | "music")[])
        : input.target.kind === "music"
          ? (["music"] satisfies readonly ("www" | "music")[])
          : (["www", "music"] satisfies readonly ("www" | "music")[])
    return {
      recorder: state,
      busy,
      label,
      hint,
      conflict,
      answer,
      commands: commandStatus,
      warnings: state.key && commands !== undefined ? shortcutWarnings(state.key, { sites, platform: input.platform, commands }) : []
    }
  }
  function publish() {
    if (active) for (const listener of listeners) listener(view())
  }
  const commandRead = input.commands.read().then(
    read => {
      if (!active) return
      commandStatus = read.kind
      commands = read.kind === "available" ? read.keys : undefined
      publish()
    },
    () => {
      if (active) {
        commandStatus = "unavailable"
        commands = undefined
        publish()
      }
    }
  )
  async function save(key: Readonly<Key> | null, confirmation: KeyAssignmentChange["confirmation"]) {
    const mine = ++revision
    busy = true
    answer = undefined
    publish()
    const change: KeyAssignmentChange = { kind: "key", target: input.target, expected: keyForWire(expected), key, confirmation }
    let result: KeySettingAnswer
    try {
      result = await input.send(change)
    } catch {
      result = { kind: "refused", reason: "unavailable" }
    }
    if (!active || mine !== revision) return
    answer = result
    busy = false
    if (result.kind === "conflict" && key) {
      state = { kind: "conflict", key: expected, candidate: key, conflicts: result.conflicts.map(row => ({ target: row.target, sites: row.sites })) }
      conflict = { candidate: key, observations: result.conflicts }
    } else if (result.kind === "confirmed") {
      state = { kind: "idle", key }
      expected = key
      conflict = undefined
      publish()
      if (key !== null) await input.committed?.()
      return
    } else {
      current = decodeSettings(input.settings())
      expected = keyAt(current, input.target) ?? null
      state = { kind: "idle", key: expected }
      conflict = undefined
    }
    publish()
  }
  function dispatch(event: RecorderEvent): { readonly consume: boolean; readonly completed: Promise<void> } {
    if (!active || busy) return { consume: false, completed: Promise.resolve() }
    if (event.kind === "start") {
      current = decodeSettings(input.settings())
      expected = keyAt(current, input.target) ?? null
      state = { kind: "idle", key: expected }
      conflict = undefined
      answer = undefined
    }
    if (conflict && event.kind === "use-here") {
      const seen = conflict
      if (state.kind === "conflict") state = recorder(state, event, { settings: current, target: input.target, platform: input.platform }).state
      state = { kind: "idle", key: expected }
      conflict = undefined
      return { consume: false, completed: save(seen.candidate, { kind: "use-here", conflicts: seen.observations }) }
    }
    if (event.kind === "cancel" || event.kind === "close" || event.kind === "blur") conflict = undefined
    const step = recorder(state, event, { settings: current, target: input.target, platform: input.platform })
    state = step.state
    if (step.outcome.kind === "cancelled") conflict = undefined
    if (state.kind === "conflict") conflict = { candidate: state.candidate, observations: conflictObservations(current, input.target, state.candidate) }
    if (step.outcome.kind === "commit") {
      state = { kind: "idle", key: expected }
      return { consume: step.consume, completed: save(step.outcome.key, { kind: "none" }) }
    }
    publish()
    return { consume: step.consume, completed: Promise.resolve() }
  }
  return {
    view,
    dispatch,
    commandRead,
    subscribe(listener: (view: RecorderView) => void) {
      listeners.add(listener)
      listener(view())
      return () => {
        listeners.delete(listener)
      }
    },
    refresh() {
      if (!active || busy || state.kind !== "idle" || conflict) return
      current = decodeSettings(input.settings())
      expected = keyAt(current, input.target) ?? null
      state = { kind: "idle", key: expected }
      publish()
    },
    dispose() {
      if (!active) return
      dispatch({ kind: "close" })
      active = false
      revision++
      listeners.clear()
    }
  }
}
