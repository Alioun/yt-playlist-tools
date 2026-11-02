import { isRouteId, isSetVideoId, type Job, type JobData, type JobFailure, type JobInvocation, type JobOf, type MembershipRow, type Origin, type SetVideoId } from "../../../src/shared/contracts"
import { isAccountKey, isChannelId, isPlaylistId, isShortcutId, isVideoId, type AccountKey, type PlaylistId, type VideoId } from "../../../src/shared/model"
import { createAddFlow, type AddFlow, type Answer, type Execution, type Facts, type Feature, type FlowJob, type Mark, type Shared, type Target } from "../../../src/background/add-flow/add-flow"
import { emptySessionRevision, parseSessionMemory, planSessionChange, type SessionPort } from "../../../src/background/store/session-memory"
import type { JsonObject } from "../../../src/shared/contracts/json"

// An always-confirming session area for instance-level cases. Owner integration lives in tools/fixtures/add-flow-session.
export function memorySession(): SessionPort & { readonly raw: JsonObject } {
  let raw: JsonObject = {}, sequence = 0
  return {
    get raw() { return raw },
    async read() {
      const memory = parseSessionMemory(raw)
      return memory ? { kind: "memory", memory, revision: emptySessionRevision, sequence: ++sequence } : { kind: "unavailable", reason: "session-layout" }
    },
    async change(change) {
      const plan = planSessionChange(raw, change)
      const memory = plan && parseSessionMemory(plan.expected)
      if (!plan || !memory) return { kind: "unavailable", reason: "session-layout" }
      raw = plan.expected
      return { kind: "committed", memory, revision: emptySessionRevision, sequence: ++sequence }
    }
  }
}

export function brand<T>(check: (value: unknown) => value is T, value: string): T {
  if (!check(value)) throw new Error(`Invalid synthetic identifier ${value}`)
  return value
}
export const accounts = { a: brand(isAccountKey, "accountAAAAAAAAA"), b: brand(isAccountKey, "accountBBBBBBBBB") }
export const lists = {
  music: brand(isPlaylistId, "PLmusic"), learning: brand(isPlaylistId, "PLlearning"),
  later: brand(isPlaylistId, "WL"), old: brand(isPlaylistId, "PLold"), fresh: brand(isPlaylistId, "PLfresh")
}
export const videoAt = (n: number) => brand(isVideoId, `vid${String(n).padStart(8, "0")}`)
export const channels = { listed: brand(isChannelId, `UC${"a".repeat(22)}`), other: brand(isChannelId, `UC${"b".repeat(22)}`) }
export const shortcut = brand(isShortcutId, "gymmix")
const route = brand(isRouteId, "synthetic-route")

export const ok = <K extends FlowJob>(data: JobData<JobOf<K>>): Answer<K> => ({ kind: "result", result: { ok: true, data, route } })
export const no = <K extends FlowJob>(reason: JobFailure["reason"], http?: number): Answer<K> =>
  ({ kind: "result", result: http === undefined ? { ok: false, reason } : { ok: false, reason, http } })
export const fact = <K extends FlowJob>(found: Facts[K]): Answer<K> => ({ kind: "fact", fact: found })

type Script = { [K in FlowJob]: ((call: JobInvocation<JobOf<K>>) => Answer<K> | undefined)[] }
export type Call = { lane: string; acct: AccountKey; job: Job }
type Tab = { acct: AccountKey | null; load: number }

// A controllable execution port over an in-memory YouTube, plus a store-like owner.
// Recent adds stay off unless a case asks for them, so the session traces other cases pin keep their shape.
export function harness(options: { session?: SessionPort; clock?: number; recentAdds?: boolean; titles?: Readonly<Record<string, string>> } = {}) {
  let clock = options.clock ?? 1_000_000
  let writable = true
  let hanging = false
  let gate: { promise: Promise<void>; open: () => void; kind: FlowJob | null } | null = null
  let serial = 0
  const calls: Call[] = []
  const marks: [Mark, Origin][] = []
  const delays: number[] = []
  const accountReads: Feature[] = []
  const live = new Map<string, number>()
  const peaks = new Map<string, number>()
  const tabs = new Map<number, Tab>()
  const shared = new Map<Feature["kind"], Shared>()
  const setups = new Map<string, Target[]>()
  const created: Partial<Record<PlaylistId, number>> = {}
  const youtube = new Map<string, Map<SetVideoId, VideoId>>()
  const script: Script = { membership: [], add: [], save: [], remove: [], unsave: [], addBatch: [], removeBatch: [] }
  let serving = 1

  const shelf = (acct: AccountKey, playlist: PlaylistId) => {
    const key = `${acct} ${playlist}`
    const found = youtube.get(key) ?? new Map<SetVideoId, VideoId>()
    youtube.set(key, found)
    return found
  }
  const has = (acct: AccountKey, playlist: PlaylistId, video: VideoId) => [...shelf(acct, playlist).values()].includes(video)
  const featureKey = (feature: Feature) =>
    feature.kind === "shortcut" ? `shortcut ${feature.shortcut}` : feature.kind === "quick-save" ? `quick-save ${feature.site}` : feature.kind
  const entryFor = (acct: AccountKey, playlist: PlaylistId, video: VideoId) => {
    const entry = brand(isSetVideoId, `set-${playlist}-${video}-${++serial}`)
    shelf(acct, playlist).set(entry, video)
    return entry
  }
  const drop = (acct: AccountKey, playlist: PlaylistId, entry: SetVideoId) => {
    return shelf(acct, playlist).delete(entry)
  }
  const dropVideo = (acct: AccountKey, playlist: PlaylistId, video: VideoId) => {
    for (const [entry, id] of shelf(acct, playlist)) if (id === video) drop(acct, playlist, entry)
  }

  async function perform<K extends FlowJob>(lane: string, call: { acct: AccountKey; job: Job }, scripted: () => Answer<K> | undefined, world: () => Answer<K>): Promise<Answer<K>> {
    calls.push({ lane, acct: call.acct, job: call.job })
    live.set(lane, (live.get(lane) ?? 0) + 1)
    peaks.set(lane, Math.max(peaks.get(lane) ?? 0, live.get(lane) ?? 0))
    try {
      while (gate && (gate.kind === null || gate.kind === call.job.kind)) await gate.promise
      return scripted() ?? world()
    } finally {
      live.set(lane, (live.get(lane) ?? 1) - 1)
    }
  }

  function execution(lane: string): Execution["run"] {
    return {
      membership: call => perform(lane, call, () => script.membership.shift()?.(call), () => {
        const rows: MembershipRow[] = Object.values(lists).map(id => ({ id, title: id, contains: has(call.acct, id, call.job.videoId) }))
        return ok<"membership">(rows)
      }),
      add: call => perform(lane, call, () => script.add.shift()?.(call), () => has(call.acct, call.job.playlistId, call.job.videoId)
        ? fact<"add">("duplicate")
        : ok<"add">({ setVideoId: entryFor(call.acct, call.job.playlistId, call.job.videoId) })),
      save: call => perform(lane, call, () => script.save.shift()?.(call), () => has(call.acct, call.job.playlistId, call.job.videoId)
        ? fact<"save">("duplicate")
        : ok<"save">({ setVideoId: entryFor(call.acct, call.job.playlistId, call.job.videoId) })),
      remove: call => perform(lane, call, () => script.remove.shift()?.(call), () => {
        if (call.job.setVideoId !== undefined) drop(call.acct, call.job.playlistId, call.job.setVideoId)
        else dropVideo(call.acct, call.job.playlistId, call.job.videoId)
        return ok<"remove">(null)
      }),
      unsave: call => perform(lane, call, () => script.unsave.shift()?.(call), () => {
        if (call.job.setVideoId !== undefined) drop(call.acct, call.job.playlistId, call.job.setVideoId)
        else dropVideo(call.acct, call.job.playlistId, call.job.videoId)
        return ok<"unsave">(null)
      }),
      addBatch: call => perform(lane, call, () => script.addBatch.shift()?.(call), () => ok<"addBatch">({
        results: call.job.videoIds.map(videoId => ({ videoId, setVideoId: entryFor(call.acct, call.job.playlistId, videoId) }))
      })),
      removeBatch: call => perform(lane, call, () => script.removeBatch.shift()?.(call), () =>
        ok<"removeBatch">({ removed: call.job.setVideoIds.filter(entry => drop(call.acct, call.job.playlistId, entry)).length }))
    }
  }

  const session = options.session ?? memorySession()
  // Each engine is a new worker: same YouTube world, owner and wall clock, fresh in-memory state.
  const engine = (port: SessionPort, generation: string): AddFlow => createAddFlow({
    async execution(origin) {
      const id = origin.kind === "tab" ? origin.tabId : serving
      const tab = tabs.get(id)
      if (!tab) return null
      const lane = `tab ${id} load ${tab.load}`
      return { lane, acct: tab.acct, run: execution(lane) }
    },
    owner: {
      shared: feature => shared.get(feature.kind) ?? { on: true, feedback: true },
      account(feature, acct) {
        accountReads.push(feature)
        return { targets: setups.get(`${acct} ${featureKey(feature)}`) ?? [], created: { ...created } }
      },
      writable: () => writable,
      mark: (change, origin) => { marks.push([change, origin]) },
      recentAdds: () => options.recentAdds ?? false,
      titles: () => ({ ...options.titles })
    },
    session: port,
    generation: () => generation,
    now: () => clock,
    wait(ms) {
      delays.push(ms)
      if (hanging) return new Promise<void>(() => {})
      clock += ms
      return Promise.resolve()
    }
  })
  const flow = engine(session, "engine")

  return {
    flow, calls, marks, delays, accountReads, script, session, engine,
    tab(id: number, acct: AccountKey | null) { tabs.set(id, { acct, load: (tabs.get(id)?.load ?? 0) + 1 }) },
    serve(id: number) { serving = id },
    setup(acct: AccountKey, feature: Feature, targets: Target[]) { setups.set(`${acct} ${featureKey(feature)}`, targets) },
    feature(kind: Feature["kind"], value: Shared) { shared.set(kind, value) },
    created(playlist: PlaylistId, at: number) { created[playlist] = at },
    has,
    entries: (acct: AccountKey, playlist: PlaylistId) => [...shelf(acct, playlist)].map(([entry, video]) => ({ entry, video })),
    put: (acct: AccountKey, playlist: PlaylistId, video: VideoId) => entryFor(acct, playlist, video),
    count: (kind: FlowJob) => calls.filter(call => call.job.kind === kind).length,
    peak: (lane: string) => peaks.get(lane) ?? 0,
    get now() { return clock },
    advance(ms: number) { clock += ms },
    withdraw() { writable = false },
    hang() { hanging = true },
    block(kind: FlowJob | null = null) {
      let open = () => {}
      const promise = new Promise<void>(resolve => { open = resolve })
      gate = { promise, open, kind }
    },
    open() {
      gate?.open()
      gate = null
    }
  }
}

export const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0))
export const tabOrigin = (tabId: number, incognito = false): Origin => ({ kind: "tab", tabId, incognito })
