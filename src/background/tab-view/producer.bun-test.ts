import { expect, test } from "bun:test"
import { isTabView } from "../../shared/contracts/tab-view"
import { createTabViewProducer, tabViewFacts } from "./producer"
import { tabContext, viewWorld, syntheticHealth } from "../../../tools/fixtures/tab-view/harness"
import { projectionSeed, a, b, alpha, beta, video, otherVideo, document, deferred, origin } from "../../../tools/fixtures/tab-projection/harness"
import { build, nextBuild } from "../../../tools/fixtures/page-link/support"
import { defaultSettings } from "../../shared/model/defaults"

test("real owner produces detached site options, keys, sort and only this account's rows", async () => {
  const h = viewWorld(),
    before = h.removal.state()
  try {
    const result = await h.producer.produce(tabContext())
    expect(result.kind).toBe("view")
    if (result.kind !== "view") throw Error("Complete view unavailable")
    expect(isTabView(result.view)).toBe(true)
    expect(result.view.features).toEqual([
      { id: "auto-add", options: { on: true, feedback: true, pct: 73, toolbarTick: true, toolbarPaused: true } },
      {
        id: "shortcuts",
        options: { on: true, feedback: true, music: true, preset: false, picker: null, list: [{ id: "orig01", label: "Alpha shortcut", key: null, watchLaterOnEveryAccount: false }] }
      }
    ])
    expect(result.view.pickerSortAZ).toBe(true)
    expect(result.view.undoKey).toEqual(defaultSettings().undoKey)
    expect(result.view.paused).toBe(true)
    expect<unknown>(result.view.skips).toEqual({
      kind: "normal",
      entries: [
        [video, [alpha]],
        ["ccccccccccc", "all"]
      ]
    })
    expect(JSON.stringify(result.view)).not.toContain(b)
    expect(JSON.stringify(result.view)).not.toMatch(/neverSend|device-extension|cooldown|recent|shown|gathers|revision|sequence/)
    const expected = structuredClone(result)
    Object.assign(result.view.features[0]?.options ?? {}, { pct: 1 })
    if (result.view.signedIn && result.view.setup.kind === "live") Object.assign(result.view.setup.setup.label ?? {}, { name: "Changed" })
    const skip = result.view.skips?.entries[0]?.[1]
    if (Array.isArray(skip)) skip.push(beta)
    expect(await h.producer.produce(tabContext())).toEqual(expected)
    expect(h.removal.state()).toEqual(before)
    expect(h.writes()).toEqual([])
    expect(h.syncReads()).toEqual([])
  } finally {
    await h.dispose()
  }
})

test("the view carries this browser's last visibility for new playlists once one was picked (YT-NEW-03)", async () => {
  const seed = projectionSeed()
  seed.local.device = { ...(seed.local.device as object), newPlaylistVisibility: "UNLISTED" }
  const h = viewWorld(seed)
  try {
    const result = await h.producer.produce(tabContext())
    expect(result.kind === "view" && result.view.newPlaylistVisibility).toBe("UNLISTED")
  } finally {
    await h.dispose()
  }
  const unset = viewWorld()
  try {
    const result = await unset.producer.produce(tabContext())
    expect(result.kind === "view" && "newPlaylistVisibility" in result.view).toBe(false)
  } finally {
    await unset.dispose()
  }
})

test("registry gates include file-free Gather and exclude non-page features", async () => {
  const settings = defaultSettings()
  for (const section of [
    settings.autoAdd,
    settings.shortcuts,
    settings.quickSave,
    settings.queueButton,
    settings.watchButton,
    settings.cardMenu,
    settings.browserMenu,
    settings.musicActions,
    settings.musicKeys,
    settings.anyTabKeys,
    settings.gather
  ])
    section.on = true
  settings.gather.auto.background = true
  const seed = projectionSeed()
  seed.local["doc:settings"] = document(settings)
  const h = viewWorld(seed)
  try {
    const www = await h.producer.produce(tabContext()),
      music = await h.producer.produce(tabContext("music"))
    expect(www.kind === "view" && www.view.features.map(feature => feature.id)).toEqual(["auto-add", "shortcuts", "quick-save", "queue-button", "watch-button", "card-menu", "gather"])
    expect(music.kind === "view" && music.view.features.map(feature => feature.id)).toEqual(["shortcuts", "music-actions", "music-keys"])
    h.removal.foreign(state => {
      state.local["doc:settings"] = document({ ...settings, musicSection: false })
    })
    const off = await h.producer.produce(tabContext("music"))
    expect(off.kind === "view" && off.view.features).toEqual([])
    h.removal.foreign(state => {
      state.local["doc:settings"] = document({ ...settings, shortcuts: { ...settings.shortcuts, music: false } })
    })
    const keysOff = await h.producer.produce(tabContext("music"))
    expect(keysOff.kind === "view" && keysOff.view.features.map(feature => feature.id)).toEqual(["music-actions", "music-keys"])
    settings.gather.auto.background = false
    h.removal.foreign(state => {
      state.local["doc:settings"] = document(settings)
    })
    const noGather = await h.producer.produce(tabContext())
    expect(noGather.kind === "view" && noGather.view.features.some(feature => feature.id === "gather")).toBe(false)
  } finally {
    await h.dispose()
  }
})

test("private view reads actual AddFlow memory and never borrows normal skips", async () => {
  const h = viewWorld(),
    privateContext = tabContext("www", true)
  try {
    const before = h.removal.state()
    expect(await h.flow.skip({ kind: "skip", acct: a, video: otherVideo, playlists: [beta] }, { kind: "tab", tabId: 7, incognito: true })).toEqual({ kind: "remembered", scope: "private" })
    await h.flow.skip({ kind: "skip", acct: b, video, playlists: "all" }, { kind: "tab", tabId: 8, incognito: true })
    const result = await h.producer.produce(privateContext)
    expect(result.kind === "view" && result.view.skips).toEqual({ kind: "private", entries: [[otherVideo, [beta]]] })
    expect(h.removal.state()).toEqual(before)
    expect(h.writes()).toEqual([])
    const normal = await h.producer.produce(tabContext())
    expect<unknown>(normal.kind === "view" && normal.view.skips).toEqual({
      kind: "normal",
      entries: [
        [video, [alpha]],
        ["ccccccccccc", "all"]
      ]
    })
  } finally {
    await h.dispose()
  }
})

test("signed-out views omit all account data and unknown identity stays unavailable", async () => {
  const h = viewWorld()
  try {
    const result = await h.producer.produce(tabContext("www", true, false))
    expect(result.kind === "view" && { acct: result.view.acct, setup: result.view.setup, filters: result.view.filters, skips: result.view.skips }).toEqual({
      acct: null,
      setup: null,
      filters: [],
      skips: null
    })
    const unknown = { ...tabContext(), info: { site: "www", build, signedIn: undefined, acct: null } }
    // @ts-expect-error Unknown identity is not a Tabs-authenticated account.
    expect(await h.producer.produce(unknown)).toEqual({ kind: "unavailable" })
  } finally {
    await h.dispose()
  }
})

test("absent settings use owner defaults and absent Setup/filter states stay explicit", async () => {
  const seed = projectionSeed()
  delete seed.local["doc:settings"]
  delete seed.local[`doc:setup:${a}`]
  for (const key of Object.keys(seed.local)) if (key.startsWith(`doc:filter:${a}:`)) delete seed.local[key]
  const h = viewWorld(seed)
  try {
    const result = await h.producer.produce(tabContext())
    expect(result.kind === "view" && result.view.features).toEqual([])
    expect(result.kind === "view" && result.view.setup).toEqual({ kind: "none" })
    expect(result.kind === "view" && result.view.filters).toEqual([])
  } finally {
    await h.dispose()
  }
})

test("unreadable own documents never become configured defaults", async () => {
  for (const part of ["settings", `setup:${a}`, `filter:${a}:${alpha}`])
    for (const raw of [document({}, 20), document({ invalid: true, autoAdd: "bad", quickSave: 42, channels: "bad" })]) {
      const seed = projectionSeed()
      seed.local[`doc:${part}`] = raw
      const h = viewWorld(seed)
      try {
        expect(await h.producer.produce(tabContext())).toEqual({ kind: "unavailable" })
      } finally {
        await h.dispose()
      }
    }
})

test("unavailable monitoring or notices cannot be defaulted to working", async () => {
  for (const part of ["statuses", "notices"] as const) {
    const health = syntheticHealth()
    if (part === "statuses") health.statuses.read = async () => ({ kind: "unavailable" })
    else health.notices.read = async () => ({ kind: "unavailable" })
    const h = viewWorld(projectionSeed(), health)
    try {
      expect(await h.producer.produce(tabContext())).toEqual({ kind: "unavailable" })
    } finally {
      await h.dispose()
    }
  }
})

test("collaborator account, site, build and privacy mismatches are unavailable", async () => {
  for (const part of ["statuses", "notices"] as const)
    for (const changed of [{ acct: b }, { site: "music" as const }, { build: nextBuild }, { private: true }, { tabId: 99 }, { windowId: 99 }]) {
      const health = syntheticHealth()
      if (part === "statuses") {
        const original = health.statuses.read
        health.statuses.read = async (context, enabled) => {
          const result = await original(context, enabled)
          return result.kind === "statuses" && result.facts.signedIn ? { ...result, facts: { ...result.facts, ...changed } } : result
        }
      } else
        health.notices.read = async context => {
          const facts = tabViewFacts(context)
          if (!facts.signedIn) throw Error("Synthetic mismatch requires a signed-in context")
          return { kind: "notices", facts: { ...facts, ...changed }, current: () => true, notices: [] }
        }
      const h = viewWorld(projectionSeed(), health)
      try {
        expect(await h.producer.produce(tabContext())).toEqual({ kind: "unavailable" })
      } finally {
        await h.dispose()
      }
    }
})

test("late health cannot revive removed accounts or a disposed producer", async () => {
  for (const end of ["remove", "dispose", "owner-dispose"] as const) {
    const health = syntheticHealth(),
      gate = deferred(),
      original = health.statuses.read
    health.statuses.read = async (context, enabled) => {
      await gate.wait()
      return original(context, enabled)
    }
    const h = viewWorld(projectionSeed(), health)
    try {
      const pending = h.producer.produce(tabContext())
      await gate.entered
      if (end === "dispose") h.producer.dispose()
      else if (end === "owner-dispose") await h.owner.dispose()
      else {
        const prepared = await h.owner.prepareAccountRemoval(origin, a)
        if (prepared.kind !== "confirmation-required") throw Error("Synthetic removal preparation unavailable")
        await h.owner.removeAccountSetup(origin, prepared.confirmation)
      }
      gate.release()
      expect(await pending).toEqual({ kind: "unavailable" })
    } finally {
      gate.release()
      await h.dispose()
    }
  }
})

test("late notices cannot publish a stale owner projection", async () => {
  const health = syntheticHealth(),
    gate = deferred()
  health.notices.read = async context => {
    await gate.wait()
    return { kind: "notices", facts: tabViewFacts(context), current: () => true, notices: [] }
  }
  const h = viewWorld(projectionSeed(), health)
  try {
    const pending = h.producer.produce(tabContext())
    await gate.entered
    h.removal.foreign(state => {
      state.local["doc:settings"] = document({ autoAdd: { on: false } })
    })
    gate.release()
    expect(await pending).toEqual({ kind: "unavailable" })
  } finally {
    gate.release()
    await h.dispose()
  }
})

test("status and notice generations must still be current after awaited work", async () => {
  for (const part of ["statuses", "notices"] as const) {
    const health = syntheticHealth(),
      gate = deferred()
    let current = true
    const statusRead = health.statuses.read,
      noticeRead = health.notices.read
    health.statuses.read = async (context, enabled) => {
      const result = await statusRead(context, enabled)
      return result.kind === "statuses" ? { ...result, current: () => part !== "statuses" || current } : result
    }
    health.notices.read = async (context, statuses) => {
      const result = await noticeRead(context, statuses)
      await gate.wait()
      return result.kind === "notices" ? { ...result, current: () => part !== "notices" || current } : result
    }
    const h = viewWorld(projectionSeed(), health)
    try {
      const pending = h.producer.produce(tabContext())
      await gate.entered
      current = false
      gate.release()
      expect(await pending).toEqual({ kind: "unavailable" })
    } finally {
      gate.release()
      await h.dispose()
    }
  }
})

test("a pending actual private-memory read cannot revive a disposed producer", async () => {
  const h = viewWorld(),
    gate = deferred()
  try {
    await h.flow.skip({ kind: "skip", acct: a, video: otherVideo, playlists: [beta] }, { kind: "tab", tabId: 7, incognito: true })
    let sessions = 0
    h.boundary(async kind => {
      if (kind === "session" && ++sessions === 3) await gate.wait()
    })
    const pending = h.producer.produce(tabContext("www", true))
    await gate.entered
    h.producer.dispose()
    gate.release()
    expect(await pending).toEqual({ kind: "unavailable" })
  } finally {
    gate.release()
    await h.dispose()
  }
})

test("unavailable private memory and malformed health cannot yield a complete view", async () => {
  const h = viewWorld()
  try {
    await h.flow.quiesce()
    expect(await h.producer.produce(tabContext("www", true))).toEqual({ kind: "unavailable" })
    const health = syntheticHealth()
    health.statuses.read = async context => ({ kind: "statuses", facts: tabViewFacts(context), current: () => true, statuses: [] })
    const bad = createTabViewProducer({ owner: h.owner, addFlow: h.flow, statuses: health.statuses, notices: health.notices, build })
    expect(await bad.produce(tabContext())).toEqual({ kind: "unavailable" })
    bad.dispose()
  } finally {
    await h.dispose()
  }
})

test("native context/build disagreement never asks the owner for a view", async () => {
  const h = viewWorld()
  try {
    const mismatched = createTabViewProducer({ owner: h.owner, addFlow: h.flow, ...syntheticHealth(), build: nextBuild })
    expect(await mismatched.produce(tabContext())).toEqual({ kind: "unavailable" })
    expect(await h.producer.produce({ ...tabContext(), tab: { ...tabContext().tab, site: "music" } })).toEqual({ kind: "unavailable" })
    expect(h.removal.io).toEqual([])
    mismatched.dispose()
  } finally {
    await h.dispose()
  }
})
