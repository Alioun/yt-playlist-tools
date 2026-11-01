import type { Job, JobFailure, MembershipRow, PlaylistRow } from "../../shared/contracts"
import { isPlaylistId } from "../../shared/model/validation"
import type { HttpAnswer, RequestRoute, RequestSpec } from "./port"
import { channelBrowse, channelResolve, channelUrl, continuationFor, isWrite } from "./requests"
import {
  parseChannelDetails, parseLabel, parseMembership, parsePlaylists, parseRequestedChannel, parseResolved, parseWrite
} from "../parsers/playlists"

export type AnswerStep = { kind: "answer"; answer: HttpAnswer; route: RequestRoute } | { kind: "failure"; failure: JobFailure }
export type ParsedJob = { kind: "parsed"; data: unknown; route: RequestRoute } | { kind: "failure"; failure: JobFailure }
type Send = (spec: RequestSpec) => Promise<AnswerStep>

export async function requestAnswer(options: {
  job: Job; first: RequestSpec; send: Send; privacy: Map<string, MembershipRow["privacy"]>;
  unrecognised(route: RequestRoute, body: unknown): void
}): Promise<ParsedJob> {
  const { job, send } = options
  let step = await send(options.first)
  if (step.kind === "failure") return step
  const bad = (): ParsedJob => {
    if (step.kind === "answer") options.unrecognised(step.route, step.answer.body)
    return { kind: "failure", failure: { ok: false, reason: isWrite(job) ? "unconfirmed" : "unavailable" } }
  }
  if (job.kind === "membership" || job.kind === "playlists") {
    const memberships: MembershipRow[] = [], playlists: PlaylistRow[] = [], ids = new Set<string>(), tokens = new Set<string>()
    for (let page = 0; page < 20; page++) {
      const parsed = job.kind === "membership" ? parseMembership(step.answer.body) : parsePlaylists(step.answer.body)
      if (!parsed) return bad()
      for (const row of parsed.rows) {
        if (ids.has(row.id)) {
          if (job.kind === "membership" && "contains" in row && memberships.find(previous => previous.id === row.id)?.contains !== row.contains) return bad()
          continue
        }
        ids.add(row.id)
        if (job.kind === "membership") {
          if (!("contains" in row) || typeof row.contains !== "boolean") return bad()
          memberships.push({ id: row.id, title: row.title, ...(row.privacy ? { privacy: row.privacy } : {}),
            ...(row.count !== undefined ? { count: row.count } : {}), contains: row.contains })
          if (row.privacy) options.privacy.set(row.id, row.privacy)
        } else {
          const cached = options.privacy.get(row.id)
          playlists.push({ ...row, ...(row.privacy === undefined && cached ? { privacy: cached } : {}) })
        }
      }
      if (!parsed.continuation) {
        if (job.kind === "playlists" && !ids.has("WL")) playlists.push(watchLater())
        return { kind: "parsed", data: job.kind === "membership" ? memberships : playlists, route: step.route }
      }
      if (tokens.has(parsed.continuation)) return bad()
      tokens.add(parsed.continuation)
      step = await send(continuationFor(job.kind === "membership" ? "playlist/get_add_to_playlist" : "browse", parsed.continuation))
      if (step.kind === "failure") return step
    }
    return bad()
  }
  if (job.kind === "resolveChannel") {
    const visited = new Set<string>()
    for (let hop = 0; hop <= 3; hop++) {
      const resolved = parseResolved(step.answer.body)
      if (!resolved) return bad()
      if (resolved.kind === "channel") {
        const details = await send(channelBrowse(resolved.channelId))
        if (details.kind === "failure") return details
        const data = parseChannelDetails(details.answer.body, resolved.channelId)
        return data ? { kind: "parsed", data, route: details.route } : bad()
      }
      const url = channelUrl(resolved.url)
      if (hop === 3 || !url || visited.has(url)) return bad()
      visited.add(url)
      step = await send(channelResolve(url))
      if (step.kind === "failure") return step
    }
    return bad()
  }
  const data = job.kind === "accountLabel" ? parseLabel(step.answer.body) : job.kind === "channelOf" ?
    parseRequestedChannel(step.answer.body, job.videoId) : parseWrite(job, step.answer.body)
  return data === undefined ? bad() : { kind: "parsed", data, route: step.route }
}

function watchLater(): PlaylistRow {
  const id = "WL"
  if (!isPlaylistId(id)) throw new Error("Invalid fixed playlist")
  return { id, title: "Watch Later" }
}
