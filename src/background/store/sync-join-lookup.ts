import { isJsonValue } from "../../shared/contracts/json"
import { decodeSyncMeta } from "../../shared/model/decodeSyncMeta"
import { DOCUMENT_VERSION } from "../../shared/model/documents"
import type { Snapshot } from "../../shared/model/settings-view"
import type { Settings, Stamp, SyncMeta } from "../../shared/model/types"
import type { SettingsPath } from "../../shared/features/registration"
import type { SyncClock, SyncStorage } from "./local-filter-writer"
import { readSyncInventory } from "./sync-inventory"

export type SyncedFeatureChoices = Readonly<Record<SettingsPath, boolean>> & {
  readonly musicSection: Settings["musicSection"]
}

export type SyncedChoicesResult =
  | {
    readonly kind: "found"
    readonly historyId: SyncMeta["id"]
    readonly settingsGeneration: Stamp["gen"]
    readonly features: Snapshot<SyncedFeatureChoices>
  }
  | { readonly kind: "not-found" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "update-needed"; readonly target: "metadata" | "settings"; readonly version: number }
  | { readonly kind: "unavailable"; readonly reason: "reset" | "invalid" | "incomplete" | "ambiguous-history" | "stale" }
  | { readonly kind: "failed"; readonly stage: "read" | "subscribe" | "clock"; readonly error: unknown }

export type SyncedChoicesLookup = {
  readonly result: Promise<SyncedChoicesResult>
  cancel(): void
}

type Observation = Exclude<SyncedChoicesResult, { kind: "cancelled" | "failed" }>

function observe(raw: unknown): Observation {
  if (!isJsonValue(raw) || raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { kind: "unavailable", reason: "invalid" }
  }
  const items = Object.entries(raw).map(([key, value]) => ({ key, value }))
  const inventory = readSyncInventory({ items })
  if (inventory.kind === "invalid") return { kind: "unavailable", reason: "invalid" }
  if (!Object.hasOwn(raw, "s:meta")) {
    return items.length === 0 ? { kind: "not-found" } : { kind: "unavailable", reason: "ambiguous-history" }
  }

  let history: SyncMeta
  try {
    history = decodeSyncMeta(raw["s:meta"])
  } catch {
    return { kind: "unavailable", reason: "invalid" }
  }
  if (history.v > DOCUMENT_VERSION) return { kind: "update-needed", target: "metadata", version: history.v }
  if (history.reset) return { kind: "unavailable", reason: "reset" }

  const settings = inventory.documents.find(document => document.key.kind === "settings")?.result
  if (!settings || settings.kind === "absent" || settings.kind === "incomplete") {
    return { kind: "unavailable", reason: "incomplete" }
  }
  if (settings.kind === "newer-version") return { kind: "update-needed", target: "settings", version: settings.version }
  if (settings.kind !== "value" || settings.value.kind !== "settings") return { kind: "unavailable", reason: "invalid" }
  const saved = settings.value.document.data
  const features = Object.freeze({
    autoAdd: saved.autoAdd.on,
    shortcuts: saved.shortcuts.on,
    quickSave: saved.quickSave.on,
    queueButton: saved.queueButton.on,
    watchButton: saved.watchButton.on,
    cardMenu: saved.cardMenu.on,
    browserMenu: saved.browserMenu.on,
    musicActions: saved.musicActions.on,
    musicKeys: saved.musicKeys.on,
    anyTabKeys: saved.anyTabKeys.on,
    gather: saved.gather.on,
    musicSection: saved.musicSection
  } satisfies SyncedFeatureChoices)
  return { kind: "found", historyId: history.id, settingsGeneration: settings.value.document.gen, features }
}

export function beginSyncedChoicesLookup(deps: {
  readonly sync: Pick<SyncStorage, "get" | "subscribe">
  readonly clock: Pick<SyncClock, "now" | "after">
  readonly isCurrent: () => boolean
}): SyncedChoicesLookup {
  let cancel = () => {}
  const result = new Promise<SyncedChoicesResult>(resolve => {
    let phase: "waiting" | "reading" | "done" = "waiting"
    let revision = 0
    let listening = false
    let latest: Observation = { kind: "unavailable", reason: "stale" }
    const stops: { stage: "subscribe" | "clock"; stop: () => void }[] = []

    function finish(outcome: SyncedChoicesResult): void {
      if (phase === "done") return
      phase = "done"
      for (const { stage, stop } of stops.splice(0).reverse()) {
        try {
          stop()
        } catch (error) {
          if (outcome.kind !== "failed") outcome = { kind: "failed", stage, error }
        }
      }
      resolve(outcome)
    }
    cancel = () => finish({ kind: "cancelled" })

    function own(stop: () => void, stage: "subscribe" | "clock"): void {
      if (phase === "done") stop()
      else stops.push({ stage, stop })
    }

    function current(): boolean {
      if (phase === "done") return false
      try {
        if (deps.isCurrent()) return true
        finish({ kind: "unavailable", reason: "stale" })
      } catch (error) {
        finish({ kind: "failed", stage: "read", error })
      }
      return false
    }

    let lastTime: number
    let deadline: number
    try {
      lastTime = deps.clock.now()
      deadline = lastTime + 10_000
      if (!Number.isFinite(lastTime) || !Number.isFinite(deadline)) throw new RangeError("Expected a finite monotonic time")
      own(deps.clock.after(10_000, () => {
        if (current()) finish(latest)
      }), "clock")
    } catch (error) {
      finish({ kind: "failed", stage: "clock", error })
      return
    }

    function live(): boolean {
      if (!current()) return false
      try {
        const now = deps.clock.now()
        if (!Number.isFinite(now) || now < lastTime) throw new RangeError("Expected a finite monotonic time")
        lastTime = now
        if (now < deadline) return true
        finish(latest)
      } catch (error) {
        finish({ kind: "failed", stage: "clock", error })
      }
      return false
    }

    function releaseRead(): boolean {
      if (phase === "done") return false
      phase = "waiting"
      return live()
    }

    async function read(): Promise<void> {
      if (phase !== "waiting" || !live()) return
      phase = "reading"
      const readingRevision = revision
      let raw: unknown
      try {
        raw = await deps.sync.get()
      } catch (error) {
        if (!releaseRead()) return
        if (readingRevision !== revision) void read()
        else finish({ kind: "failed", stage: "read", error })
        return
      }
      if (!releaseRead()) return
      if (readingRevision !== revision) {
        void read()
        return
      }
      try {
        latest = observe(raw)
        if (latest.kind === "found") finish(latest)
      } catch (error) {
        finish({ kind: "failed", stage: "read", error })
      }
    }

    if (!live()) return
    try {
      own(deps.sync.subscribe(() => {
        if (!live()) return
        revision++
        latest = { kind: "unavailable", reason: "stale" }
        if (listening) void read()
      }), "subscribe")
      listening = true
    } catch (error) {
      finish({ kind: "failed", stage: "subscribe", error })
      return
    }
    void read()
  })
  return { result, cancel: () => cancel() }
}
