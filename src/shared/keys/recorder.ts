import { isKey } from "../model"
import { findConflicts } from "./bindings"
import { isComposing, modifiers } from "./match"
import { isReserved } from "./policy"
import type { RecorderContext, RecorderEvent, RecorderState, RecorderStep, Refusal } from "./types"

const noModifiers = { ctrl: false, alt: false, shift: false, meta: false }
const modifierNames = new Set(["Control", "Alt", "Shift", "Meta", "OS", "AltGraph", "Fn", "FnLock", "Hyper", "Super"])
const characters = new Intl.Segmenter("und", { granularity: "grapheme" })

export function recorder(state: RecorderState, event: RecorderEvent, context: RecorderContext): RecorderStep {
  const unchanged = { state, consume: false, outcome: { kind: "none" } } satisfies RecorderStep
  const cancel = (consume: boolean): RecorderStep => ({ state: { kind: "idle", key: state.key }, consume, outcome: { kind: "cancelled" } })
  if (event.kind === "start") {
    return { state: { kind: "recording", key: state.key, modifiers: { ...noModifiers }, refusal: null }, consume: false, outcome: { kind: "none" } }
  }
  if (event.kind === "clear") return { state: { kind: "idle", key: null }, consume: false, outcome: { kind: "commit", key: null, clear: [] } }
  if (state.kind === "idle") return unchanged
  if (event.kind === "blur" || event.kind === "close" || event.kind === "cancel") return cancel(false)
  if (event.kind === "use-here") {
    if (state.kind !== "conflict") return unchanged
    const conflicts = findConflicts(context.settings, context.target, state.candidate)
    return { state: { kind: "idle", key: state.candidate }, consume: false,
      outcome: { kind: "commit", key: state.candidate, clear: conflicts.map(conflict => conflict.target) } }
  }
  const facts = event.facts
  if (isComposing(facts) || facts.repeat) return unchanged
  if (event.kind === "keydown" && (facts.key === "Escape" || facts.code === "Escape")) return cancel(true)
  if (event.kind === "keydown" && (facts.key === "Tab" || facts.code === "Tab")) return cancel(false)
  if (state.kind === "conflict") return unchanged
  const held = modifiers(facts)
  const waiting = (refusal: Refusal | null, consume: boolean): RecorderStep => ({
    state: { ...state, modifiers: held, refusal }, consume, outcome: { kind: "none" }
  })
  if (event.kind === "keyup") return waiting(state.refusal, false)
  if (modifierNames.has(facts.key) || /^(Control|Alt|Shift|Meta)(Left|Right)$/.test(facts.code)) return waiting(null, false)
  if (facts.altGraph || (held.ctrl && held.alt)) return waiting("ctrl-alt", true)
  if (!held.ctrl && !held.alt && !held.shift && !held.meta && ["Enter", "NumpadEnter", "Space"].includes(facts.code)) {
    return waiting("plain-enter-space", true)
  }
  const char = facts.key !== " " && Array.from(characters.segment(facts.key)).length === 1 ? facts.key : undefined
  const candidate = { code: facts.code, ...held, ...(char === undefined ? {} : { char }) }
  if (!isKey(candidate)) return waiting("unsupported-key", true)
  if (isReserved(candidate, context.platform)) return waiting("reserved", true)
  const conflicts = findConflicts(context.settings, context.target, candidate)
  if (conflicts.length) {
    return { state: { kind: "conflict", key: state.key, candidate, conflicts }, consume: true, outcome: { kind: "none" } }
  }
  return { state: { kind: "idle", key: candidate }, consume: true, outcome: { kind: "commit", key: candidate, clear: [] } }
}
