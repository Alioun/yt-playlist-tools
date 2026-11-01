import { expect, test } from "bun:test"
import { isFeatureSettingChange } from "../../../src/shared/contracts/shared-settings"
import { featureProgressKey, readFeatureProgress } from "../../../src/background/store/feature-settings-progress"
import { readConsentDevice, withdrawalItems, agreementItems } from "../../../src/background/store/consent-withdrawal"
import { bindingsForSite } from "../../../src/shared/keys/bindings"
import { cases } from "./specimens"
import { world, seed, object, gate, sessionSeed, type Fault, type Route } from "./harness"

const routes: readonly Route[] = ["owner", "native", "wire"]
const autoOff = { kind: "feature", feature: "auto-add", value: false } as const
const autoOn = { ...autoOff, value: true } as const
const musicOn = { kind: "feature", feature: "music-actions", value: true } as const

for (const route of routes) for (const privateWindow of [false, true]) {
  for (const specimen of cases) test(`${route} ${privateWindow} roundtrips ${specimen.name} without losing the complete settings inventory`, async () => {
    const w = world(route, seed(), privateWindow)
    try {
      expect(await w.owner.ready()).toBe("ok")
      const before = w.h.records(), settings = w.settings()
      expect(await w.change(specimen.change)).toMatchObject({ kind: "confirmed", status: "changed" })
      expect(await w.change({ ...specimen.change, value: false })).toMatchObject({ kind: "confirmed", status: "changed" })
      expect(w.settings()).toEqual(settings)
      expect(w.h.records().device).toEqual(before.device)
      expect(w.h.session()).toEqual(sessionSeed)
      expect(w.events).toEqual([{ kind: "settings-changed", source: "local" }, { kind: "settings-changed", source: "local" }])
      expect(w.h.counts.rawLocal).toBe(0)
      expect(w.serviceCalls).toBe(0)
      for (const [name, raw] of Object.entries(before)) {
        if (["doc:settings", "sync"].includes(name)) continue
        expect(w.h.records()[name]).toEqual(specimen.name === "auto-add" && /^progress:[AB]{16}:/.test(name) ? {} : raw)
      }
      if (specimen.name === "auto-add") expect(readFeatureProgress(w.h.records()[featureProgressKey])).toMatchObject({ kind: "valid", record: { state: "terminal", original: { v: 1, at: 1 } } })
    } finally { await w.dispose() }
  })

  test(`${route} ${privateWindow} Music section preserves hidden feature choices and requests no permission`, async () => {
    const w = world(route, seed(), privateWindow)
    try {
      await w.owner.ready()
      expect(await w.change(musicOn)).toMatchObject({ kind: "confirmed" })
      const selected = w.settings().musicActions
      w.trace.length = 0
      expect(await w.change({ kind: "music-section", value: true })).toMatchObject({ kind: "confirmed" })
      expect(await w.change({ kind: "music-section", value: false })).toMatchObject({ kind: "confirmed" })
      expect(w.settings().musicActions).toEqual(selected)
      expect(w.trace).not.toContain("request")
      expect(bindingsForSite(w.settings(), { site: "music", undoAvailable: true })).toEqual([])
    } finally { await w.dispose() }
  })

  test(`${route} ${privateWindow} denial keeps Music features and Also on Music off while retaining consent`, async () => {
    const w = world(route, seed(), privateWindow)
    try {
      await w.owner.ready(); w.grant.music = false; w.prompt.music = false
      for (const change of [musicOn, { kind: "feature", feature: "music-keys", value: true }] as const) {
        expect(await w.change(change)).toEqual({ kind: "refused", reason: "site-access" })
      }
      expect(await w.change({ kind: "feature", feature: "shortcuts", value: true })).toMatchObject({ kind: "confirmed" })
      expect(await w.change({ kind: "shortcuts-music", value: true })).toEqual({ kind: "refused", reason: "site-access" })
      expect(w.settings().musicActions.on).toBe(false); expect(w.settings().musicKeys.on).toBe(false)
      expect(w.settings().shortcuts.music).toBe(false)
      expect(object(w.h.records().device).consent).toEqual({ v: 1, at: 1 })
    } finally { await w.dispose() }
  })

  test(`${route} ${privateWindow} shortcuts and any-tab keys retain their Music denial exceptions`, async () => {
    const initial = seed(); const settings = object(object(initial["doc:settings"]).data)
    object(settings.shortcuts).preset = false; object(settings.shortcuts).list = []
    const w = world(route, initial, privateWindow)
    try {
      await w.owner.ready(); w.grant.music = false; w.prompt.music = false
      expect(await w.change({ kind: "feature", feature: "shortcuts", value: true })).toMatchObject({ kind: "confirmed", limitedMusic: true })
      expect(w.settings().shortcuts.on).toBe(true); expect(w.settings().shortcuts.music).toBe(false)
      expect(w.settings().shortcuts.list).toHaveLength(1)
      expect(await w.change({ kind: "feature", feature: "any-tab-keys", value: true })).toMatchObject({ kind: "confirmed", limitedMusic: true })
      expect(w.settings().anyTabKeys.on).toBe(true)
    } finally { await w.dispose() }
  })

  test(`${route} ${privateWindow} browser-menu permission is observed on enable and released after confirmed off`, async () => {
    const w = world(route, seed(), privateWindow), on = { kind: "feature", feature: "browser-menu", value: true } as const
    try {
      await w.owner.ready(); w.grant.browserMenu = false; w.prompt.browserMenu = false
      expect(await w.change(on)).toEqual({ kind: "refused", reason: "browser-menu-permission" })
      expect(w.batches).toEqual([])
      w.grant.browserMenu = true; w.prompt.browserMenu = true
      expect(await w.change(on)).toMatchObject({ kind: "confirmed" })
      w.trace.length = 0
      expect(await w.change({ ...on, value: false })).toMatchObject({ kind: "confirmed", menuPermission: "released" })
      expect(w.grant.browserMenu).toBe(false)
      expect(w.trace.indexOf("remove")).toBeGreaterThan(w.trace.indexOf("set"))
      expect(w.trace.slice(w.trace.indexOf("set") + 1, w.trace.indexOf("remove"))).toContain("read")
    } finally { await w.dispose() }
  })

  test(`${route} ${privateWindow} failed menu release reports the saved off value without success`, async () => {
    const initial = seed(); object(object(object(initial["doc:settings"]).data).browserMenu).on = true
    const w = world(route, initial, privateWindow)
    try {
      await w.owner.ready(); w.removal(false)
      expect(await w.change({ kind: "feature", feature: "browser-menu", value: false })).toEqual({ kind: "refused", reason: "permission-release" })
      expect(w.settings().browserMenu.on).toBe(false)
      expect(w.events).toEqual([{ kind: "settings-changed", source: "local" }])
      w.removal(true)
      expect(await w.change({ kind: "feature", feature: "browser-menu", value: false })).toMatchObject({ kind: "confirmed", status: "unchanged", menuPermission: "released" })
    } finally { await w.dispose() }
  })
}

for (const route of routes) {
  for (const fault of ["reject-before", "reject-after", "ignore", "partial", "mismatch", "readback-fail"] satisfies readonly Fault[]) {
    for (const stage of [1, 2, 3]) test(`${route} auto-add off ${fault} at write ${stage} never publishes early success`, async () => {
      const initial = seed(); object(object(object(initial["doc:settings"]).data).autoAdd).on = true
      const w = world(route, initial)
      let after = initial
      try {
        await w.owner.ready(); w.fail(fault, stage)
        const result = await w.change(autoOff)
        // A one-key acceptance/retirement write cannot be partially applied by this fixture.
        if (fault === "partial" && stage !== 2) expect(result).toMatchObject({ kind: "confirmed" })
        else { expect(result.kind).toBe("refused"); expect(w.events).toEqual([]) }
        after = w.h.records()
      } finally { await w.dispose() }
      const restarted = world(route, after)
      try {
        const marker = readFeatureProgress(after[featureProgressKey])
        if (marker.kind === "valid" && marker.record.state === "accepted") {
          await expect(restarted.owner.ready()).rejects.toThrow()
          expect(await restarted.change(autoOn)).toEqual({ kind: "refused", reason: "unavailable" })
          const review = await restarted.owner.readWithdrawnWork(restarted.origin)
          expect(review.kind).toBe("held")
          if (review.kind !== "held") throw Error("Expected cleanup recovery review")
          const job = review.work.find(entry => entry.kind === "feature-settings")
          if (job?.kind !== "feature-settings") throw Error("Expected exact cleanup selection")
          const recovered = await restarted.owner.recoverWithdrawnWork(restarted.origin, { review: review.review, job: job.selection })
          if (fault === "mismatch") expect(recovered.kind).not.toBe("feature-settings-recovered")
          else expect(recovered.kind).toBe("feature-settings-recovered")
        }
      } finally { await restarted.dispose() }
    })
  }

  test(`${route} unchanged switches and ordinary feedback edits never clear remembered progress`, async () => {
    const w = world(route)
    try {
      await w.owner.ready(); const before = w.h.records()
      expect(await w.change(autoOff)).toMatchObject({ kind: "confirmed", status: "unchanged" })
      expect(await w.owner.changeSharedSetting(w.origin, { kind: "option", field: "autoAdd.feedback", value: false })).toEqual({ kind: "committed" })
      for (const name of Object.keys(before).filter(name => name.startsWith("progress:"))) expect(w.h.records()[name]).toEqual(before[name])
      expect(w.h.records()).not.toHaveProperty(featureProgressKey)
    } finally { await w.dispose() }
  })

  test(`${route} off/on cannot revive progress and keeps playlists, percentages, filters, Undo and history`, async () => {
    const w = world(route)
    try {
      await w.owner.ready(); const before = w.h.records(), session = w.h.session()
      await w.change(autoOn); expect(await w.change(autoOff)).toMatchObject({ kind: "confirmed" })
      expect(await w.change(autoOn)).toMatchObject({ kind: "confirmed" })
      for (const name of Object.keys(before).filter(name => /^progress:[AB]{16}:/.test(name))) expect(w.h.records()[name]).toEqual({})
      for (const name of Object.keys(before).filter(name => name.startsWith("doc:setup:") || name.startsWith("doc:filter:"))) expect(w.h.records()[name]).toEqual(before[name])
      expect(w.settings().autoAdd.pct).toBe(object(object(object(before["doc:settings"]).data).autoAdd).pct)
      expect(w.h.session()).toEqual(session)
    } finally { await w.dispose() }
  })

  test(`${route} presets run once, preserve edits/deletions and avoid migration and occupied key identities`, async () => {
    const initial = seed(), settings = object(object(initial["doc:settings"]).data)
    object(settings.shortcuts).preset = false
    const w = world(route, initial)
    try {
      await w.owner.ready()
      const original = w.settings().shortcuts.list
      expect(await w.change({ kind: "feature", feature: "shortcuts", value: true })).toMatchObject({ kind: "confirmed" })
      const applied = w.settings().shortcuts
      expect(applied.list.slice(0, original.length)).toEqual(original)
      expect(new Set(applied.list.map(row => row.id)).size).toBe(applied.list.length)
      w.h.mutate(records => { object(object(object(records["doc:settings"]).data).shortcuts).list = [] })
      await w.change({ kind: "feature", feature: "shortcuts", value: false })
      await w.change({ kind: "feature", feature: "shortcuts", value: true })
      expect(w.settings().shortcuts.list).toEqual([])
      expect(w.settings().shortcuts.preset).toBe(true)
    } finally { await w.dispose() }
  })

  test(`${route} withdrawal and regrant do not replay cleanup under fresh consent`, async () => {
    const initial = seed(); object(object(object(initial["doc:settings"]).data).autoAdd).on = true
    const w = world(route, initial)
    let pending = initial
    try {
      await w.owner.ready(); w.fail("reject-before", 2)
      expect((await w.change(autoOff)).kind).toBe("refused"); pending = w.h.records()
    } finally { await w.dispose() }
    const read = readConsentDevice(pending)
    if (read.kind !== "supported") throw Error("Expected withdrawal source")
    const withdrawn = withdrawalItems(read)
    if (!withdrawn) throw Error("Expected withdrawal items")
    const held = { ...pending, ...withdrawn }
    const next = readConsentDevice(held)
    if (next.kind !== "supported") throw Error("Expected withdrawn control")
    const agreed = agreementItems(next, 300)
    if (!agreed) throw Error("Expected fresh consent")
    const restored = world(route, { ...held, ...agreed })
    try {
      await expect(restored.owner.ready()).rejects.toThrow()
      expect(restored.batches).toEqual([])
      expect(readFeatureProgress(restored.h.records()[featureProgressKey])).toMatchObject({ kind: "valid", record: { original: { v: 1, at: 1 } } })
      const review = await restored.owner.readWithdrawnWork(restored.origin)
      if (review.kind !== "held") throw Error("Expected explicit fresh review")
      const selection = review.work.find(entry => entry.kind === "feature-settings")
      if (selection?.kind !== "feature-settings") throw Error("Expected selected cleanup")
      expect(await restored.owner.recoverWithdrawnWork(restored.origin, { review: review.review, job: selection.selection })).toMatchObject({ kind: "feature-settings-recovered", original: { v: 1, at: 1 } })
      expect(object(restored.h.records().device).consent).toEqual(object(agreed.device).consent)
      expect(restored.settings().autoAdd.on).toBe(false)
      expect((await restored.owner.recoverWithdrawnWork(restored.origin, { review: review.review, job: selection.selection })).kind).toBe("unavailable")
    } finally { await restored.dispose() }
  })

  test(`${route} shortcut allocation excludes current, deleted-target and unclaimed migration identities and preserves key conflicts`, async () => {
    const initial = seed(), settings = object(object(initial["doc:settings"]).data)
    const rows = object(settings.shortcuts).list
    if (!Array.isArray(rows)) throw Error("Expected shortcut list")
    const row = object(rows[0])
    const key = { ...object(row.key), char: "w", code: "KeyW" }
    object(settings.shortcuts).preset = false
    object(settings.shortcuts).list = [{ ...row, id: "new001", key }]
    object(object(initial["doc:setup:AAAAAAAAAAAAAAAA"]).data).targets = { new002: "PL_deleted_target" }
    initial.unclaimed = { from: "1.5.0", autoAdd: [], shortcutPlaylist: "PL_migrated", originalShortcutId: "new003", filters: {}, at: 1 }
    const w = world(route, initial)
    try {
      await w.owner.ready()
      const before = w.h.records()
      const answer = await w.change({ kind: "feature", feature: "shortcuts", value: true })
      expect(answer.kind).toBe("confirmed")
      if (answer.kind !== "confirmed") throw Error("Expected confirmed shortcut preset")
      expect(answer.conflicts).toBeGreaterThan(0)
      expect(w.settings().shortcuts.list.map(value => value.id)).toEqual(["new001", "new004"])
      expect(w.settings().shortcuts.list[0]?.key).toEqual(key)
      expect(w.settings().shortcuts.list[1]?.key).toBeNull()
      expect(w.h.records().unclaimed).toEqual(before.unclaimed)
      expect(w.h.records()["doc:setup:AAAAAAAAAAAAAAAA"]).toEqual(before["doc:setup:AAAAAAAAAAAAAAAA"])
    } finally { await w.dispose() }
  })

  test(`${route} disposal during a held write cannot report success or publish`, async () => {
    const w = world(route), paused = gate()
    await w.owner.ready(); w.setHook(paused.wait)
    const changing = w.change({ kind: "feature", feature: "gather", value: true })
    await paused.entered
    const disposing = w.owner.dispose(); paused.release()
    try { expect((await changing).kind).toBe("refused"); expect(w.events).toEqual([]); await disposing }
    finally { paused.release(); await w.dispose() }
  })
}

test("wire permission request starts in the click stack before any await or RPC send", async () => {
  const w = world("wire")
  try {
    await w.owner.ready(); w.trace.length = 0
    const answer = w.backend.changeFeatureSetting(musicOn, w.settings())
    expect(w.trace).toEqual(["request"])
    expect(w.network.trace()).toEqual([])
    expect(await answer).toMatchObject({ kind: "confirmed" })
  } finally { await w.dispose() }
})

test("runtime payloads cannot supply native access, origin, paths, consent or whole Settings", () => {
  for (const raw of [{ kind: "feature", feature: "sync", value: true }, { ...musicOn, access: { music: true } },
    { ...musicOn, origin: { kind: "ui", incognito: false, windowId: 1 } }, { kind: "path", path: ["musicActions", "on"], value: true },
    { kind: "feature", feature: "gather", value: 1 }, { kind: "settings", value: seed() }]) expect(isFeatureSettingChange(raw)).toBe(false)
})
