import type { RpcCaller } from "../rpc/rpc"
import type { UiMessages } from "./ui"
import type { AccountKey } from "../model/validation"
import type { CreationId, ListOperationId, UiPlaylistList } from "./ui-playlists"

function negatives(caller: RpcCaller<UiMessages>, acct: AccountKey, operation: CreationId, listOperation: ListOperationId) {
  void caller.call("ui.playlists", { action: "open", operation: listOperation, acct, site: "www", refresh: false })
  // @ts-expect-error negative: wrong-payload. Playlist reads require explicit refresh intent.
  caller.call("ui.playlists", { action: "open", operation: listOperation, acct, site: "www" })
  // @ts-expect-error negative: invalid-site. Site validation uses the shared vocabulary.
  caller.call("ui.playlists", { action: "open", operation: listOperation, acct, site: "mobile", refresh: true })
  // @ts-expect-error negative: sender-privacy. A body cannot establish native privacy.
  caller.call("ui.playlists", { action: "open", operation: listOperation, acct, site: "www", refresh: true, incognito: false })
  // @ts-expect-error negative: sender-tab. A body cannot establish the active native tab.
  caller.call("ui.accountInView", { activeTabId: 1 })
  // @ts-expect-error negative: body-account. Account selection calls canonical Tabs.
  caller.call("ui.accountInView", { acct })
  // @ts-expect-error negative: unsupported-privacy. New playlist privacy uses the actual service vocabulary.
  caller.call("ui.create", { action: "submit", operation, title: "Title", privacy: "FRIENDS" })
  // @ts-expect-error negative: promised-result. A wire listing contains a completed finite refresh.
  const listing: UiPlaylistList = { kind: "open", cached: null, freshness: "absent", refresh: Promise.resolve(null) }
  // @ts-expect-error negative: operation-identity. Raw strings cannot name a creation operation.
  caller.call("ui.create", { action: "status", operation: "unvalidated" })
  // @ts-expect-error negative: submit-account. The authenticated operation retains its original account.
  caller.call("ui.create", { action: "submit", operation, title: "Title", privacy: "PRIVATE", acct })
  void listing
}
void negatives
