import { firstRunContract, type FirstRunMessages } from "./first-run"
import { playlistUiContract, type PlaylistUiMessages } from "./ui-playlists"
import type { RpcContract } from "../rpc/rpc"
import { clearAllContract, type ClearAllMessages } from "./clear-all"
import { pageContract, type PageMessages } from "./ui-pages"

export type UiMessages = FirstRunMessages & PlaylistUiMessages & ClearAllMessages & PageMessages
export const uiContract: RpcContract<UiMessages> = { ...firstRunContract, ...playlistUiContract, ...clearAllContract, ...pageContract }

