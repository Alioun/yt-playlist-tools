import type { RpcCaller } from "../../../shared/rpc/rpc"
import type { UiMessages } from "../../../shared/contracts/ui"
import type { UiCacheStatus } from "../../../shared/contracts/ui-playlists"
import type { PlaylistCacheCapture } from "../../store/playlist-cache"

function negatives(caller: RpcCaller<UiMessages>, capture: PlaylistCacheCapture) {
  // @ts-expect-error negative: raw-owner-token. Disposable storage authority never crosses UI JSON.
  const cache: UiCacheStatus = { kind: "committed", capture }
  // @ts-expect-error negative: raw-capture-operation. A storage capture is not a form operation identity.
  caller.call("ui.create", { action: "status", operation: capture })
  void cache
}
void negatives
