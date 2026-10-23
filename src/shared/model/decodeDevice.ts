import { boolean, checked, DecodeError, isRecord, natural, nonempty, nullable, object, oneOf, optional, positive, text } from "./codec"
import { defaultDevice } from "./defaults"
import { decodeKey } from "./keys"
import type { Device, UpgradeDetails } from "./types"
import { isAccountKey, isPercent } from "./validation"

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
    claimNotice: nullable(object({ acct: checked(isAccountKey, "a 16-character account key"), dropped: natural })),
    lastAccount: nullable(checked(isAccountKey, "a 16-character account key")),
    newPlaylistVisibility: nullable(oneOf("PRIVATE", "UNLISTED", "PUBLIC")),
    pickerSortAZ: boolean, detailedLog: boolean, recentAdds: boolean, legacyCleared: boolean
  }, () => fallback)(raw, "device")
}
