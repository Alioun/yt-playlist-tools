import { boolean, dictionary, natural, nonempty, nullable, object, oneOf, optional, text } from "./codec"
import type { SyncOpaqueWrite, SyncState } from "./types"

const opaqueWrite = object<SyncOpaqueWrite>({
  gate: nullable(object<NonNullable<SyncOpaqueWrite["gate"]>>({
    kind: oneOf("pending", "held"), notBefore: natural
  })),
  diagnostic: nullable(object<NonNullable<SyncOpaqueWrite["diagnostic"]>>({
    name: nullable(text), message: nullable(text)
  }))
})

export const decodeSyncState: (raw: unknown) => SyncState = object<SyncState>({
  joined: nullable(nonempty),
  pushed: dictionary(() => true, nonempty),
  status: oneOf("off", "joining", "ok", "full", "update-needed", "waiting"),
  editedSinceOff: boolean,
  everEdited: optional(boolean),
  opaqueWrite: optional(opaqueWrite)
})
