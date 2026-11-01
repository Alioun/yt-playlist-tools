import type { JobId, MusicAdEvidence, MusicAdFailure } from "../../../src/shared/contracts"
import { isJob } from "../../../src/shared/contracts"

export const indicators: readonly MusicAdEvidence[] = ["adShowing", "adActive", "presentingPlayerType"]
export function adFailure(evidence: MusicAdEvidence = "adShowing") {
  return { ok: false, reason: "unavailable", detail: { kind: "music-ad", evidence } } satisfies MusicAdFailure
}

const rawJobs = {
  account: { kind: "account" }, accountLabel: { kind: "accountLabel" },
  membership: { kind: "membership", videoId: "synthetic01" }, playlists: { kind: "playlists" },
  add: { kind: "add", playlistId: "WL", videoId: "synthetic01" },
  remove: { kind: "remove", playlistId: "WL", videoId: "synthetic01" },
  addBatch: { kind: "addBatch", playlistId: "WL", videoIds: ["synthetic01"] },
  removeBatch: { kind: "removeBatch", playlistId: "WL", setVideoIds: ["entry"] },
  save: { kind: "save", playlistId: "WL", videoId: "synthetic01" },
  unsave: { kind: "unsave", playlistId: "WL", videoId: "synthetic01" },
  create: { kind: "create", title: "Synthetic", privacy: "PRIVATE" },
  channelOf: { kind: "channelOf", videoId: "synthetic01" }, resolveChannel: { kind: "resolveChannel", input: "Synthetic" },
  videoInfo: { kind: "videoInfo" }, queueAdd: { kind: "queueAdd" },
  queueUndo: { kind: "queueUndo", listId: "list", setVideoId: "entry" },
  queueAddList: { kind: "queueAddList", videoIds: ["synthetic01"] }, openCardMenu: { kind: "openCardMenu", videoId: "synthetic01" },
  itemInfo: { kind: "itemInfo" },
  queueInsert: { kind: "queueInsert", position: "end", endpoint: { queueAddEndpoint: { queueTarget: { videoId: "synthetic01" }, queueInsertPosition: "INSERT_AT_END" } } },
  queueRemove: { kind: "queueRemove", id: 7 }, queueRemoveIds: { kind: "queueRemoveIds", ids: [7] },
  queueMove: { kind: "queueMove", id: 7, to: "end" }, queueReinsert: { kind: "queueReinsert", videoId: "synthetic01", index: 0 },
  like: { kind: "like", endpoint: { likeEndpoint: { nativeAction: "synthetic" } } },
  library: { kind: "library", endpoint: { feedbackEndpoint: { nativeAction: "synthetic" } } },
  navigate: { kind: "navigate", endpoint: { browseEndpoint: { browseId: "MPREsynthetic" } } },
  nowPlaying: { kind: "nowPlaying" }, castState: { kind: "castState" }
} satisfies Record<JobId, unknown>

export const jobs = Object.values(rawJobs).map(job => {
  if (!isJob(job)) throw Error("Invalid synthetic job census")
  return job
})
