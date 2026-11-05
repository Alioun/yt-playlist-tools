import { boolean, natural, nonempty, object, optional, positive } from "./codec"
import type { SyncMeta } from "./types"

export const decodeSyncMeta: (raw: unknown) => SyncMeta = object<SyncMeta>({
  v: positive,
  id: nonempty,
  created: natural,
  reset: optional(boolean)
})
