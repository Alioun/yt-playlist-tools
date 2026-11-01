import { firstRunContract, type FirstRunMessages } from "./first-run"
import { playlistUiContract, type PlaylistUiMessages } from "./ui-playlists"
import type { RpcContract } from "../rpc/rpc"
import { clearAllContract, type ClearAllMessages } from "./clear-all"

export type UiMessages = FirstRunMessages & PlaylistUiMessages & ClearAllMessages
export const uiContract: RpcContract<UiMessages> = { ...firstRunContract, ...playlistUiContract, ...clearAllContract }

