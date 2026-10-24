import { boolean, dictionary, nonempty, nullable, object, oneOf } from "./codec"
import type { SyncState } from "./types"

export const decodeSyncState: (raw: unknown) => SyncState = object<SyncState>({
  joined: nullable(nonempty),
  pushed: dictionary(() => true, nonempty),
  status: oneOf("off", "joining", "ok", "full", "update-needed", "waiting"),
  editedSinceOff: boolean
})
