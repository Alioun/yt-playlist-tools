import { boolean, checked, DecodeError, isRecord, natural, nonempty, nullable, object, oneOf, optional, positive, text } from "./codec"
import { defaultDevice } from "./defaults"
import { decodeKey } from "./keys"
import type { ClaimShortcutOutcome, Device, UpgradeDetails } from "./types"
import { isAccountKey, isPercent, isShortcutId } from "./validation"

function decodeClaimShortcut(raw: unknown, path = "claim.shortcut"): ClaimShortcutOutcome {
  if (!isRecord(raw)) throw new DecodeError(path, "a shortcut outcome")
  switch (raw.kind) {
    case "not-carried":
    case "not-owned": return object({ kind: oneOf("not-carried", "not-owned") })(raw, path)
    case "filled":
    case "already-set": return object({ kind: oneOf("filled", "already-set"), shortcut: checked(isShortcutId, "a six-character shortcut ID") })(raw, path)
    case "skipped": return object({ kind: oneOf("skipped"), reason: oneOf("missing-provenance", "deleted-original", "target-filled") })(raw, path)
    default: throw new DecodeError(`${path}.kind`, "a shortcut outcome kind")
  }
}

export const decodeUpgradeDetails = object<UpgradeDetails>({
  from: oneOf("1.4.5", "1.5.0"),
  autoAdd: object({ kept: natural, dropped: natural }),
  pct: object({ value: checked(isPercent, "an integer percentage from 0 to 100"), wasUnset: boolean, authorised: boolean }),
  feedback: boolean,
  shortcut: object({
    raw: text, key: nullable(decodeKey), playlist: boolean,
    note: oneOf("ok", "ctrl-never-fired", "unconvertible", "no-playlist", "no-key", "none"),
    clash: optional(text)
  }),
  credentialsDeleted: boolean
})

export function decodeDevice(raw?: unknown, fallbackId?: string): Device {
  const id = isRecord(raw) && typeof raw.id === "string" ? raw.id : fallbackId
  if (id === undefined) throw new DecodeError("device.id", "a stored or caller-supplied device ID")
  const fallback = defaultDevice(nonempty(id, "device.id"))
  return object<Device>({
    id: nonempty,
    consent: nullable(object({ v: positive, at: natural })),
    syncOn: boolean,
    upgradeNote: nullable(object({
      state: oneOf("pending", "done"), details: decodeUpgradeDetails,
      opened: boolean, seen: boolean, reopened: boolean
    }, () => ({ opened: false, seen: false, reopened: false }))),
    claimNotice: nullable(object({
      acct: checked(isAccountKey, "a 16-character account key"), dropped: natural,
      claim: optional(object({ autoAddAdded: natural, filtersAdded: natural, shortcut: decodeClaimShortcut }))
    })),
    lastAccount: nullable(checked(isAccountKey, "a 16-character account key")),
    newPlaylistVisibility: nullable(oneOf("PRIVATE", "UNLISTED", "PUBLIC")),
    pickerSortAZ: boolean, detailedLog: boolean, recentAdds: boolean, legacyCleared: boolean
  }, () => fallback)(raw, "device")
}
