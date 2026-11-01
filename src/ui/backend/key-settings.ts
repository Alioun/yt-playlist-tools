import { decodeSettings, STORAGE_SCHEMA_VERSION, CONSENT_VERSION, decodeDevice } from "../../shared/model"
import { readSettingsView, type Snapshot } from "../../shared/model/settings-view"
import type { Settings } from "../../shared/model"
import type { ReadOnlyLocal, LocalListener } from "./backend"

export type KeySettingsSnapshot = { readonly kind: "value"; readonly settings: Snapshot<Settings> } |
  { readonly kind: "unavailable"; readonly reason: "read" | "consent" | "update-needed" | "disposed" }
export type KeySettingsSource = ReturnType<typeof createKeySettingsSource>
export function createKeySettingsSource(local: ReadOnlyLocal) {
  const names = ["schema", "device", "doc:settings"]
  let active = true, listening = false, revision = 0
  let current: KeySettingsSnapshot = { kind: "unavailable", reason: "read" }
  const listeners = new Set<(snapshot: KeySettingsSnapshot) => void>()
  async function load(): Promise<KeySettingsSnapshot> {
    const mine = ++revision
    let next: KeySettingsSnapshot
    try {
      const records = await local.get(names)
      if (records.schema !== STORAGE_SCHEMA_VERSION) next = { kind: "unavailable", reason: "update-needed" }
      else {
        const device = decodeDevice(records.device), view = readSettingsView(records["doc:settings"])
        next = device.consent?.v !== CONSENT_VERSION || device.upgradeNote?.state === "pending" ? { kind: "unavailable", reason: "consent" }
          : view.kind === "value" ? { kind: "value", settings: decodeSettings(view.settings) }
          : { kind: "unavailable", reason: view.kind === "newer-version" ? "update-needed" : "read" }
      }
    } catch { next = { kind: "unavailable", reason: "read" } }
    if (!active) return { kind: "unavailable", reason: "disposed" }
    if (mine !== revision) return current
    current = next
    for (const listener of listeners) listener(current)
    return current
  }
  const changed: LocalListener = (changes, area) => {
    if (active && area === "local" && names.some(name => Object.hasOwn(changes, name))) void load()
  }
  return {
    load,
    read(): KeySettingsSnapshot { return current.kind === "value" ? { kind: "value", settings: decodeSettings(current.settings) } : current },
    subscribe(listener: (snapshot: KeySettingsSnapshot) => void) {
      if (!active) { listener({ kind: "unavailable", reason: "disposed" }); return () => {} }
      if (!listening) { local.onChanged.addListener(changed); listening = true }
      listeners.add(listener); listener(current)
      return () => {
        listeners.delete(listener)
        if (listening && listeners.size === 0) { local.onChanged.removeListener(changed); listening = false }
      }
    },
    dispose() {
      if (!active) return
      active = false; revision++
      if (listening) local.onChanged.removeListener(changed)
      listening = false; listeners.clear(); current = { kind: "unavailable", reason: "disposed" }
    }
  }
}
