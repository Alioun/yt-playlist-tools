import type { PlaylistCacheCapture } from "../../../src/background/store/playlist-cache"
import type { RpcCaller } from "../../../src/shared/rpc/rpc"
import type { UiMessages } from "../../../src/shared/contracts/ui"

function ownerCapture(caller: RpcCaller<UiMessages>, capture: PlaylistCacheCapture) {
  // @ts-expect-error negative: list-owner-capture. Owner capture is never a wire operation identity.
  caller.call("ui.playlists", { action: "await", operation: capture, generation: 0 })
}
void ownerCapture
