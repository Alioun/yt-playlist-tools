import type { PickerSource, ItemPort, MembershipAnswer } from "../../../src/shared/picker/source"
import type { UiPlaylistOperation } from "../../../src/ui/backend/playlist-list/operation"
import { bridgeHarness, popup, a, alpha, beta, check, success, settle } from "../ui-read-playlist-bridge/harness"
import { deferred } from "../playlists-cache/harness"
export { bridgeHarness, popup, a, alpha, beta, check, success, settle, deferred }

export function pendingLists(options: Parameters<typeof bridgeHarness>[0] = {}) {
  const bridge = bridgeHarness(options)
  const entered = deferred<void>(),
    answer = deferred<unknown>()
  let resolved = false
  bridge.h.script(async (_tab, invocation) => {
    if (invocation.job.kind !== "playlists") return { ok: false, reason: "unavailable" }
    entered.resolve()
    return answer.promise
  })
  return {
    ...bridge,
    entered: entered.promise,
    resolve(value: unknown = success([{ id: alpha, title: "Alpha refreshed", privacy: "PRIVATE", count: 9 }])) {
      resolved = true
      answer.resolve(value)
    },
    get resolved() {
      return resolved
    },
    async dispose() {
      answer.resolve({ ok: false, reason: "unavailable" })
      await bridge.dispose()
    }
  }
}
export function pickerFixture(operation: UiPlaylistOperation, now: () => number) {
  const membership = deferred<MembershipAnswer>()
  let added = 0
  const item: ItemPort = {
    membership: () => membership.promise,
    async add() {
      added++
      return { kind: "already-in" }
    },
    async remove() {
      return { kind: "failed" }
    },
    async create() {
      return { kind: "failed", reason: "failed" }
    }
  }
  const source: PickerSource<ItemPort> = {
    item,
    private: false,
    tab: true,
    creation: "available",
    sortAZ: false,
    privacy: null,
    quickSave: null,
    chosen: [],
    keys: new Map(),
    marks: new Map(),
    now,
    authorized: () => true,
    cachedList: operation.cachedList,
    freshList: operation.freshList,
    async create() {
      return { kind: "failed", reason: "failed" }
    },
    async pin() {
      return { refused: "private" }
    },
    async choose() {
      return { refused: "private" }
    },
    async saveSortAZ() {
      return { refused: "private" }
    },
    async savePrivacy() {
      return { refused: "private" }
    }
  }
  return {
    source,
    membership,
    get added() {
      return added
    }
  }
}
