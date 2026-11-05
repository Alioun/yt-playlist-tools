import { readRoutes } from "../read-port"
import { cardMenuRoute, labelDefaultRoute, requestRoute } from "../gateway/port"
import type { RouteTable } from "../gateway/port"

const read = (id: (typeof readRoutes)[keyof typeof readRoutes]) => ({ kind: "read" as const, id })
const edit = (job: "add" | "remove" | "addBatch" | "removeBatch") => [requestRoute("command", job), requestRoute("service", job), requestRoute("signed", job)]
const request = (job: "accountLabel" | "membership" | "playlists" | "create") => [requestRoute("service", job), requestRoute("signed", job)]

export const wwwRoutes = {
  account: [read(readRoutes.account)],
  accountLabel: [...request("accountLabel"), labelDefaultRoute],
  membership: request("membership"),
  playlists: request("playlists"),
  add: edit("add"),
  remove: edit("remove"),
  addBatch: edit("addBatch"),
  removeBatch: edit("removeBatch"),
  save: [],
  unsave: [],
  create: request("create"),
  channelOf: [read(readRoutes.channelOf), requestRoute("plain", "channelOf")],
  resolveChannel: [requestRoute("plain", "resolveChannel")],
  videoInfo: [read(readRoutes.videoInfo)],
  itemInfo: [],
  nowPlaying: [],
  castState: [],
  queueAdd: [requestRoute("command", "queueAdd")],
  queueUndo: [requestRoute("command", "queueUndo")],
  queueAddList: [requestRoute("command", "queueAddList")],
  openCardMenu: [cardMenuRoute],
  queueInsert: [],
  queueRemove: [],
  queueRemoveIds: [],
  queueMove: [],
  queueReinsert: [],
  like: [],
  library: [],
  navigate: []
} satisfies RouteTable
