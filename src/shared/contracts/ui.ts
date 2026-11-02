import { firstRunContract, type FirstRunMessages } from "./first-run"
import { playlistUiContract, type PlaylistUiMessages } from "./ui-playlists"
import type { RpcContract } from "../rpc/rpc"
import { clearAllContract, type ClearAllMessages } from "./clear-all"
import { playingNowContract, type PlayingNowMessages } from "./playing-now"

export type UiMessages = FirstRunMessages & PlaylistUiMessages & ClearAllMessages & PlayingNowMessages
export const uiContract: RpcContract<UiMessages> = { ...firstRunContract, ...playlistUiContract, ...clearAllContract, ...playingNowContract }

