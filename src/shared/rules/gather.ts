import { isVideoId, type AccountKey, type GatherOrder, type Settings, type VideoId } from "../model"

export type GatherAccess = Readonly<{
  www: boolean
  music: boolean
  musicSection: Settings["musicSection"]
}>

export type GatherOrderTab = Readonly<{
  id: number
  index: number
  video: VideoId
  lastAccessed: number
}>

export type GatherStart =
  | Readonly<{ kind: "unobserved" }>
  | Readonly<{
    kind: "observed"
    hidden: boolean
    fresh: boolean
    restored: boolean
    loadedInStartupMinute: boolean
    switchedToSincePageStart: boolean
  }>

export type GatherAutoTab = GatherOrderTab & Readonly<{
  active: boolean
  pinned: boolean
  audible: boolean
  incognito: boolean
  start: GatherStart
}>

export type GatherWindow = Readonly<{
  windowId: number
  incognito: boolean
  tabs: readonly GatherAutoTab[]
}>

export type GatherLanguage = "english" | "no-answer" | "other"
export type GatherLanguages = ReadonlyMap<number, GatherLanguage>

export type GatherOrderedVideo = Readonly<{
  video: VideoId
  firstTabId: number
  tabIds: readonly number[]
}>

export type GatherChecks = Readonly<{
  unvisited: "due" | "not-due"
  background: ReadonlySet<number>
  count: "due" | "not-due"
}>

export type GatherPickMemory = Readonly<{
  account: AccountKey
  refused: ReadonlySet<VideoId>
  kept: ReadonlySet<number>
  lastGatherAt: number | null
  checks: GatherChecks
}>

export type GatherLeaveReason =
  | "feature-off" | "trigger-off" | "check-not-due"
  | "private" | "active" | "pinned" | "audible"
  | "undo-kept" | "lasting-failure"
  | "too-recent" | "not-in-background-burst"
  | "start-unobserved" | "not-started-hidden" | "not-first-load"
  | "restored" | "startup-minute" | "switched-since-page-start" | "below-count"

export type GatherTabDecision =
  | Readonly<{ kind: "picked"; tabId: number }>
  | Readonly<{ kind: "left-out"; tabId: number; reasons: readonly GatherLeaveReason[] }>

export type GatherPace =
  | Readonly<{ kind: "allowed" }>
  | Readonly<{ kind: "wait"; nextAllowedAt: number }>

export type GatherPick = Readonly<{
  unvisited: readonly GatherTabDecision[]
  background: readonly GatherTabDecision[]
  count: readonly GatherTabDecision[]
  selected: readonly number[]
  pace: GatherPace
}>

export function videoOf(url: string, access: GatherAccess): VideoId | null {
  let address: URL
  try {
    address = new URL(url)
  } catch {
    return null
  }
  if (address.protocol !== "https:" || address.port || address.username || address.password) return null
  const www = address.hostname === "www.youtube.com" && access.www
  const music = address.hostname === "music.youtube.com" && access.music && access.musicSection
  if (!www && !music) return null

  let id: string | undefined
  if (address.pathname === "/watch") {
    const values = address.searchParams.getAll("v")
    if (values.length !== 1) return null
    id = values[0]
  } else if (www && address.pathname.startsWith("/live/")) {
    id = address.pathname.slice("/live/".length)
  }
  return isVideoId(id) ? id : null
}

export function languageTitle(title: string): string {
  return title.replace(/^\(\d+\) /, "").replace(/ - YouTube(?: Music)?$/, "")
}

export function order(
  tabs: readonly GatherOrderTab[],
  gatherOrder: GatherOrder,
  languages: GatherLanguages,
  random: () => number,
): readonly GatherOrderedVideo[] {
  const byIndex = [...tabs].sort((a, b) => a.index - b.index)
  const ordered = [...byIndex]
  switch (gatherOrder) {
    case "newest": ordered.sort((a, b) => b.lastAccessed - a.lastAccessed); break
    case "oldest": ordered.sort((a, b) => a.lastAccessed - b.lastAccessed); break
    case "left-to-right": break
    case "right-to-left": ordered.reverse(); break
    case "english":
    case "non-english": {
      const rank: Record<GatherLanguage, number> = { english: 0, "no-answer": 1, other: 2 }
      const direction = gatherOrder === "english" ? 1 : -1
      ordered.sort((a, b) => direction * (
        rank[languages.get(a.id) ?? "no-answer"] - rank[languages.get(b.id) ?? "no-answer"]
      ))
      break
    }
    case "shuffled":
      for (let i = ordered.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        const current = ordered[i]
        const chosen = ordered[j]
        if (current === undefined || chosen === undefined) throw new RangeError("Random source must return a finite number in [0, 1)")
        ordered[i] = chosen
        ordered[j] = current
      }
      break
    default: {
      const exhaustive: never = gatherOrder
      return exhaustive
    }
  }

  const groups = new Map<VideoId, { video: VideoId; firstTabId: number; tabIds: number[] }>()
  for (const tab of ordered) {
    if (!groups.has(tab.video)) groups.set(tab.video, { video: tab.video, firstTabId: tab.id, tabIds: [] })
  }
  for (const tab of byIndex) groups.get(tab.video)?.tabIds.push(tab.id)
  return [...groups.values()]
}

function decision(tabId: number, reasons: readonly GatherLeaveReason[]): GatherTabDecision {
  return reasons.length === 0 ? { kind: "picked", tabId } : { kind: "left-out", tabId, reasons }
}

function gate(feature: boolean, trigger: boolean, due: boolean): GatherLeaveReason[] {
  const reasons: GatherLeaveReason[] = []
  if (!feature) reasons.push("feature-off")
  if (!trigger) reasons.push("trigger-off")
  if (!due) reasons.push("check-not-due")
  return reasons
}

export function pick(
  tabs: GatherWindow,
  settings: Readonly<Settings["gather"]>,
  now: number,
  memory: GatherPickMemory,
): GatherPick {
  const common = tabs.tabs.map(tab => {
    const reasons: GatherLeaveReason[] = []
    if (tabs.incognito || tab.incognito) reasons.push("private")
    if (tab.active) reasons.push("active")
    if (tab.pinned) reasons.push("pinned")
    if (tab.audible) reasons.push("audible")
    if (memory.kept.has(tab.id)) reasons.push("undo-kept")
    if (memory.refused.has(tab.video)) reasons.push("lasting-failure")
    return { tab, reasons }
  })
  const eligibleCount = common.filter(({ reasons }) => reasons.length === 0).length
  const duration = { "1h": 3_600_000, "1d": 86_400_000, "1w": 604_800_000 }[settings.auto.after]
  const unvisitedGate = gate(settings.on, settings.auto.unvisited, memory.checks.unvisited === "due")
  const backgroundGate = gate(settings.on, settings.auto.background, true)
  const countGate = gate(settings.on, settings.auto.count, memory.checks.count === "due")

  const unvisited = common.map(({ tab, reasons }) => {
    if (unvisitedGate.length) return decision(tab.id, unvisitedGate)
    const leftOut = [...reasons]
    if (now - tab.lastAccessed < duration) leftOut.push("too-recent")
    return decision(tab.id, leftOut)
  })
  const background = common.map(({ tab, reasons }) => {
    if (backgroundGate.length) return decision(tab.id, backgroundGate)
    const leftOut = [...reasons]
    if (!memory.checks.background.has(tab.id)) leftOut.push("not-in-background-burst")
    if (tab.start.kind === "unobserved") {
      leftOut.push("start-unobserved")
    } else {
      if (!tab.start.hidden) leftOut.push("not-started-hidden")
      if (!tab.start.fresh) leftOut.push("not-first-load")
      if (tab.start.restored) leftOut.push("restored")
      if (tab.start.loadedInStartupMinute) leftOut.push("startup-minute")
      if (tab.start.switchedToSincePageStart) leftOut.push("switched-since-page-start")
    }
    return decision(tab.id, leftOut)
  })
  const count = common.map(({ tab, reasons }) => {
    if (countGate.length) return decision(tab.id, countGate)
    const leftOut = [...reasons]
    if (eligibleCount < settings.auto.n) leftOut.push("below-count")
    return decision(tab.id, leftOut)
  })
  const selected = new Set<number>()
  for (const decisions of [unvisited, background, count]) {
    for (const result of decisions) if (result.kind === "picked") selected.add(result.tabId)
  }
  const nextAllowedAt = memory.lastGatherAt === null ? null : memory.lastGatherAt + 60_000
  return {
    unvisited, background, count, selected: [...selected],
    pace: nextAllowedAt !== null && now < nextAllowedAt
      ? { kind: "wait", nextAllowedAt }
      : { kind: "allowed" },
  }
}
