import type { Backend } from "../backend"
import type { PickerSource, Listing } from "../../../shared/picker/source"
import type { RpcCaller } from "../../../shared/rpc/rpc"
import type { UiMessages } from "../../../shared/contracts/ui"
import type { AccountKey } from "../../../shared/model/validation"
import type { CreationId, ListOperationId, UiPlaylistAnswer, UiListCompletion } from "../../../shared/contracts/ui-playlists"

function protocol(backend: Backend, caller: RpcCaller<UiMessages>, acct: AccountKey, operation: ListOperationId,
  creation: CreationId, listing: Listing) {
  const read = backend.playlistList({ acct, site: "www" })
  const pickerMethods: Pick<PickerSource, "cachedList" | "freshList"> = read
  void caller.call("ui.playlists", { action: "open", operation, acct, site: "www", refresh: false })
  void caller.call("ui.playlists", { action: "await", operation, generation: 0 })
  void caller.call("ui.playlists", { action: "refresh", operation, generation: 1 })
  void caller.call("ui.playlists", { action: "release", operation })
  // @ts-expect-error negative: list-open-account. Opening a list requires its account.
  caller.call("ui.playlists", { action: "open", operation, site: "www", refresh: false })
  // @ts-expect-error negative: list-await-generation. Waiting names the exact refresh generation.
  caller.call("ui.playlists", { action: "await", operation })
  // @ts-expect-error negative: list-refresh-authority. Refresh cannot replace the captured account.
  caller.call("ui.playlists", { action: "refresh", operation, generation: 1, acct })
  // @ts-expect-error negative: list-release-no-work. Release cannot carry a refresh generation.
  caller.call("ui.playlists", { action: "release", operation, generation: 0 })
  // @ts-expect-error negative: list-id-brand. Creation and list operations have different identities.
  caller.call("ui.playlists", { action: "release", operation: creation })
  // @ts-expect-error negative: list-pending-finite. An open answer carries finite refresh metadata.
  const promised: UiPlaylistAnswer = { kind: "open", operation, cached: null, freshness: "absent", refresh: Promise.resolve(null) }
  // @ts-expect-error negative: list-refreshed-finite. A completed refresh cannot carry a native callback.
  const callback: UiPlaylistAnswer = { kind: "refreshed", operation, generation: 0, refresh: () => listing }
  // @ts-expect-error negative: list-release-identity. A released answer still names its operation.
  const released: UiPlaylistAnswer = { kind: "released" }
  // @ts-expect-error negative: list-withheld-no-rows. Refused authority cannot expose refreshed rows.
  const withheld: UiListCompletion = { kind: "withheld", confirmed: true, cache: null, listing }
  // @ts-expect-error negative: list-readonly-time. Picker timestamps remain readonly.
  listing.at = 0
  // @ts-expect-error negative: list-refresh-native-privacy. A caller cannot set native privacy.
  backend.playlistList({ acct, site: "www", private: false })
  void [pickerMethods, promised, callback, released, withheld]
}
void protocol
