import { firstRunContract, type FirstRunMessages } from "./first-run"
import { playlistUiContract, type PlaylistUiMessages } from "./ui-playlists"
import type { RpcContract } from "../rpc/rpc"
import { clearAllContract, type ClearAllMessages } from "./clear-all"
import { playingNowContract, type PlayingNowMessages } from "./playing-now"
import { uiAddContract, type UiAddMessages } from "./ui-add"

export type UiMessages = FirstRunMessages & PlaylistUiMessages & ClearAllMessages & PageMessages & PlayingNowMessages & UiAddMessages
export const uiContract: RpcContract<UiMessages> = { ...firstRunContract, ...playlistUiContract, ...clearAllContract, ...pageContract, ...playingNowContract, ...uiAddContract }

