import { readRoutes } from "../read-port"
import { accountLabelRoute, handlerRoute, requestRoute } from "../gateway/port"
import type { RouteTable } from "../gateway/port"

const read = (id: (typeof readRoutes)[keyof typeof readRoutes]) => ({ kind: "read" as const, id })
export const musicRoutes = {
  account: [read(readRoutes.account)],
  accountLabel: [accountLabelRoute, requestRoute("music", "accountLabel")],
  membership: [requestRoute("music", "membership")],
  playlists: [],
  add: [],
  remove: [],
  addBatch: [],
  removeBatch: [],
  save: [requestRoute("music", "save")],
  unsave: [requestRoute("music", "unsave")],
  create: [requestRoute("music", "create")],
  channelOf: [],
  resolveChannel: [],
  videoInfo: [],
  itemInfo: [read(readRoutes.itemInfo)],
  nowPlaying: [read(readRoutes.nowPlaying)],
  castState: [read(readRoutes.castState)],
  queueAdd: [],
  queueUndo: [],
  queueAddList: [],
  openCardMenu: [],
  queueInsert: [handlerRoute("menu-item", "queueInsert"), handlerRoute("replay", "queueInsert")],
  queueRemove: [handlerRoute("queue", "queueRemove")],
  queueRemoveIds: [handlerRoute("queue", "queueRemoveIds")],
  queueMove: [handlerRoute("reorder", "queueMove")],
  queueReinsert: [handlerRoute("replay", "queueReinsert")],
  like: [handlerRoute("service", "like")],
  library: [handlerRoute("service", "library")],
  navigate: [handlerRoute("navigation", "navigate")]
} satisfies RouteTable
