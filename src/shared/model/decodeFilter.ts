import { checked, DecodeError, list, object, oneOf, boolean } from "./codec"
import { defaultFilter } from "./defaults"
import type { Filter } from "./types"
import { isChannelId } from "./validation"

const channelId = checked(isChannelId, "a UC channel ID")
const decode = object<Filter>({
  mode: oneOf("allow", "deny"), on: boolean,
  channels: list((raw, path = "filter.channels") => {
    if (!Array.isArray(raw) || raw.length < 2 || typeof raw[1] !== "string" ||
      (raw[2] !== undefined && typeof raw[2] !== "string")) throw new DecodeError(path, "a channel tuple [id, title, handle?]")
    channelId(raw[0], `${path}[0]`)
    return raw.slice() as Filter["channels"][number]
  })
}, defaultFilter)

export function decodeFilter(raw?: unknown): Filter {
  return decode(raw, "filter")
}
