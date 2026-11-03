import { isListOperationId, type UiListing, type UiPlaylistAnswer } from "../../../shared/contracts/ui-playlists"
import type { PickerSource, Listing, ListAnswer } from "../../../shared/picker/source"
import type { RpcOutcome } from "../../../shared/rpc/rpc"
import type { Backend } from "../backend"

export type UiPlaylistOperation = Pick<PickerSource, "cachedList" | "freshList"> & {
  readonly opened: Promise<RpcOutcome<UiPlaylistAnswer>>
  refresh(): Promise<RpcOutcome<UiPlaylistAnswer>>
  dispose(): void
}
type Request = Parameters<Backend["playlistList"]>[0]
function pickerListing(listing: UiListing): Listing {
  // PickerSource uses a numeric stamp. Zero marks an unknown stamp as stale while retaining every cached row.
  return { rows: listing.rows, at: listing.at ?? 0 }
}
export function createPlaylistOperation(call: Backend["call"], request: Request, availability: "ready" | "disposed" | "capacity", released: () => void): UiPlaylistOperation {
  const candidate = crypto.randomUUID()
  if (!isListOperationId(candidate)) throw Error("Invalid list operation identity")
  const operation = candidate
  let active = availability === "ready"
  let generation = 0
  let initial = true
  let waiting: number | null = null
  let pending: Promise<RpcOutcome<UiPlaylistAnswer>> | undefined
  const closed = (): RpcOutcome<UiPlaylistAnswer> => ({ kind: "failed", failure: "disposed" })
  const opened = active
    ? call("ui.playlists", { action: "open", operation, acct: request.acct, site: request.site, refresh: request.refresh === true }).then(answer => (active ? correlated(answer, "open") : closed()))
    : Promise.resolve(availability === "capacity" ? ({ kind: "answered", result: { kind: "unavailable", reason: "capacity" } } satisfies RpcOutcome<UiPlaylistAnswer>) : closed())
  function correlated(answer: RpcOutcome<UiPlaylistAnswer>, kind: "open" | "refreshed"): RpcOutcome<UiPlaylistAnswer> {
    if (answer.kind !== "answered" || answer.result.kind === "unavailable") return answer
    return answer.result.kind === kind && answer.result.operation === operation && (answer.result.kind !== "refreshed" || answer.result.generation === generation)
      ? answer
      : { kind: "failed", failure: "invalid-answer" }
  }
  function refresh(): Promise<RpcOutcome<UiPlaylistAnswer>> {
    if (!active) return Promise.resolve(closed())
    if (pending) return pending
    const work = (async (): Promise<RpcOutcome<UiPlaylistAnswer>> => {
      const ready = await opened
      if (!active) return closed()
      if (ready.kind !== "answered" || ready.result.kind !== "open") return ready
      if (initial && ready.result.refresh !== null) waiting = ready.result.refresh.generation
      initial = false
      const action = waiting === null ? "refresh" : "await"
      generation = waiting ?? generation + 1
      waiting = generation
      const answer = await call("ui.playlists", { action, operation, generation })
      if (!active) return closed()
      const result = correlated(answer, "refreshed")
      if (result.kind === "answered" && result.result.kind === "refreshed") waiting = null
      return result
    })()
    pending = work
    void work.then(
      () => {
        if (pending === work) pending = undefined
      },
      () => {
        if (pending === work) pending = undefined
      }
    )
    return work
  }
  return {
    opened,
    async cachedList() {
      const answer = await opened
      return active && answer.kind === "answered" && answer.result.kind === "open" && answer.result.cached !== null ? pickerListing(answer.result.cached) : null
    },
    refresh,
    async freshList(): Promise<ListAnswer> {
      const answer = await refresh()
      if (!active || answer.kind !== "answered" || answer.result.kind !== "refreshed") return { kind: "failed" }
      const result = answer.result.refresh
      if (result.kind === "listed") return { kind: "listed", listing: result.listing }
      return result.kind === "not-listed" && result.outcome.kind === "no-tab" ? { kind: "noTab" } : { kind: "failed" }
    },
    dispose() {
      if (!active) return
      active = false
      pending = undefined
      released()
      void call("ui.playlists", { action: "release", operation })
    }
  }
}
