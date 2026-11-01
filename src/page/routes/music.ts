import { readRoutes } from "../read-port"
import { labelDefaultRoute, requestRoute } from "../gateway/port"
import type { RouteTable } from "../gateway/port"

const read = (id: typeof readRoutes[keyof typeof readRoutes]) => ({ kind: "read" as const, id })
export const musicRoutes = {
  account: [read(readRoutes.account)], accountLabel: [requestRoute("music", "accountLabel"), labelDefaultRoute],
  membership: [requestRoute("music", "membership")], playlists: [], add: [], remove: [], addBatch: [], removeBatch: [],
  save: [requestRoute("music", "save")], unsave: [requestRoute("music", "unsave")], create: [requestRoute("music", "create")],
  channelOf: [], resolveChannel: [], videoInfo: [], itemInfo: [read(readRoutes.itemInfo)],
  nowPlaying: [read(readRoutes.nowPlaying)], castState: [read(readRoutes.castState)],
  queueAdd: [], queueUndo: [], queueAddList: [], openCardMenu: [], queueInsert: [], queueRemove: [], queueRemoveIds: [],
  queueMove: [], queueReinsert: [], like: [], library: [], navigate: []
} satisfies RouteTable
