import { expect, test } from "bun:test"
import { createStartingLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import { nativeSharedSettingsAccess } from "../../../src/background/adapters/shared-settings"
import { CONTRACT_VERSION } from "../../../src/shared/contracts/protocol"
import type { JsonValue } from "../../../src/shared/contracts/json"
import { build } from "../tabs/harness"
import { createAuthorityHarness, installAuthorityFixture, releaseAuthorityFixture } from "../interim-recovery-review/run"
import { withdrawRemovalFixture } from "../account-removal-execution/run"
import { featureProgressKey, readFeatureProgress } from "../../../src/background/store/feature-settings-progress"
import { world, seed, object, type Route, type Fault } from "./harness"

const routes: readonly Route[] = ["owner", "native", "wire"]
const musicOn = { kind: "feature", feature: "music-actions", value: true } as const
for (const route of routes) {
  test(`${route} auto-add off with sync off and absent history uses the existing first-edit provenance`, async () => {
    const initial = seed()
    delete initial.sync
    object(object(object(initial["doc:settings"]).data).autoAdd).on = true
    const w = world(route, initial)
    try {
      await w.owner.ready()
      expect(await w.change({ kind: "feature", feature: "auto-add", value: false })).toMatchObject({ kind: "confirmed" })
      expect(w.h.records().sync).toEqual({ joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: true })
      for (const acct of ["AAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBB"]) for (let shard = 0; shard < 16; shard++) expect(w.h.records()[`progress:${acct}:${shard}`]).toEqual({})
    } finally {
      await w.dispose()
    }
  })

  test(`${route} actual lifecycle withdrawal preserves cleanup and real owner disclosure regrant cannot resume it`, async () => {
    const initial = seed()
    object(object(object(initial["doc:settings"]).data).autoAdd).on = true
    const w = world(route, initial)
    let pending = initial
    try {
      await w.owner.ready()
      w.fail("reject-before", 2)
      expect((await w.change({ kind: "feature", feature: "auto-add", value: false })).kind).toBe("refused")
      pending = w.h.records()
    } finally {
      await w.dispose()
    }
    const withdrawal = await withdrawRemovalFixture({ local: pending, session: {}, sync: {} })
    expect(withdrawal.result.kind).toBe("withdrawn")
    expect(withdrawal.writes).toHaveLength(2)
    for (const boundary of withdrawal.writes) expect(boundary.after.local[featureProgressKey]).toEqual(pending[featureProgressKey])
    const restored = world(route, withdrawal.state.local)
    try {
      await expect(restored.owner.ready()).rejects.toThrow()
      expect(restored.batches).toEqual([])
      const agreement = await restored.owner.readAgreement(restored.origin)
      if (agreement.kind !== "review") throw Error("Expected held disclosure review")
      expect(
        await restored.owner.agree(restored.origin, {
          review: agreement.review,
          displayedVersion: agreement.version,
          choice: { kind: "disclosure" },
          access: Promise.resolve({ www: true, music: true, browserMenu: true })
        })
      ).toMatchObject({ kind: "committed", settingsChanged: false, activation: "held" })
      expect(restored.settings().autoAdd.on).toBe(true)
      expect(readFeatureProgress(restored.h.records()[featureProgressKey])).toMatchObject({ kind: "valid", record: { state: "accepted", original: { v: 1, at: 1 } } })
      expect((await restored.change({ kind: "music-section", value: true })).kind).toBe("refused")
      const review = await restored.owner.readWithdrawnWork(restored.origin)
      if (review.kind !== "held") throw Error("Expected fresh exact recovery review")
      const selected = review.work.find(row => row.kind === "feature-settings")
      if (selected?.kind !== "feature-settings") throw Error("Expected exact feature cleanup")
      expect(await restored.owner.recoverWithdrawnWork(restored.origin, { review: review.review, job: selected.selection })).toMatchObject({
        kind: "feature-settings-recovered",
        original: { v: 1, at: 1 }
      })
      expect(restored.settings().autoAdd.on).toBe(false)
      for (const acct of ["AAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBB"]) for (let shard = 0; shard < 16; shard++) expect(restored.h.records()[`progress:${acct}:${shard}`]).toEqual({})
    } finally {
      await restored.dispose()
    }
  })

  for (const fault of ["reject-before", "reject-after", "ignore", "mismatch", "readback-fail"] satisfies readonly Fault[])
    test(`${route} ordinary ${fault} requires exact readback and no publication`, async () => {
      const w = world(route)
      try {
        await w.owner.ready()
        w.fail(fault)
        expect((await w.change({ kind: "feature", feature: "gather", value: true })).kind).toBe("refused")
        expect(w.events).toEqual([])
      } finally {
        await w.dispose()
      }
    })

  for (const refusal of ["consent", "join", "newer", "quota"] as const)
    test(`${route} ${refusal} refusal precedes mutation and preserves the stored switch`, async () => {
      const initial = seed()
      if (refusal === "quota") {
        object(initial.device).syncOn = true
        initial.sync = { joined: "history", pushed: { "doc:settings": "settings-0" }, status: "ok", editedSinceOff: false }
        object(object(initial["doc:settings"]).data).futureHuge = "x".repeat(150_000)
      }
      const w = world(route, initial)
      try {
        await w.owner.ready()
        w.h.mutate(records => {
          if (refusal === "consent") object(records.device).consent = null
          if (refusal === "join") records["pending:sync-join"] = { v: 99 }
          if (refusal === "newer") object(records["doc:settings"]).v = 99
        })
        const before = w.h.records()
        expect((await w.change(musicOn)).kind).toBe("refused")
        expect(w.h.records()).toEqual(before)
        expect(w.batches).toEqual([])
        expect(w.events).toEqual([])
      } finally {
        await w.dispose()
      }
    })

  test(`${route} consent-only agreement followed by denied Music request keeps consent saved`, async () => {
    const initial = seed()
    object(initial.device).consent = null
    const w = world(route, initial)
    try {
      await w.owner.ready()
      const read = await w.owner.readAgreement(w.origin)
      if (read.kind !== "review") throw Error("Expected consent review")
      expect(
        (
          await w.owner.agree(w.origin, {
            review: read.review,
            displayedVersion: read.version,
            choice: { kind: "disclosure" },
            access: Promise.resolve({ www: true, music: false, browserMenu: false })
          })
        ).kind
      ).toBe("committed")
      const consent = object(w.h.records().device).consent
      w.grant.music = false
      w.prompt.music = false
      expect(await w.change(musicOn)).toEqual({ kind: "refused", reason: "site-access" })
      expect(object(w.h.records().device).consent).toEqual(consent)
      expect(w.settings().musicActions.on).toBe(false)
    } finally {
      await w.dispose()
    }
  })
}

test("private shared configuration is accepted while private setup and first-run selection remain refused", async () => {
  const w = world("wire", seed(), true)
  try {
    await w.owner.ready()
    expect(await w.change(musicOn)).toMatchObject({ kind: "confirmed" })
    const before = w.h.records()
    const agreed = await w.backend.change({ kind: "first-run-agree", displayedVersion: 1, attempt: 1, selected: [], syncOn: false })
    expect(agreed.kind).toBe("not-agreed")
    const raw = await w.network.connect({ id: "feature-fixture", url: "chrome-extension://feature-fixture/popup.html" }).send({
      v: CONTRACT_VERSION,
      build,
      id: "private-setup",
      kind: "ui.change",
      payload: { windowId: 2, change: { kind: "setup-destination", acct: "AAAAAAAAAAAAAAAA", destination: { kind: "quick-save" }, expected: { setup: "none" }, playlist: null } }
    })
    expect(raw).toBeUndefined()
    expect(w.h.records()).toEqual(before)
  } finally {
    await w.dispose()
  }
})

test("the real RPC route rejects body permission truth and forged native identity", async () => {
  const w = world("wire")
  try {
    await w.owner.ready()
    w.grant.music = false
    w.prompt.music = false
    const payloads = [
      { change: { ...musicOn, access: { music: true } }, windowId: 1 },
      { change: musicOn, windowId: 1, permissions: { music: true } },
      { change: musicOn, windowId: 1, origin: { kind: "ui", windowId: 1, incognito: false } }
    ]
    for (const [index, payload] of payloads.entries())
      await expect(
        w.network.connect({ id: "feature-fixture", url: "chrome-extension://feature-fixture/popup.html" }).send({
          v: CONTRACT_VERSION,
          build,
          id: `body-truth-${index}`,
          kind: "ui.change",
          payload
        })
      ).rejects.toThrow("Memory send failed")
    expect(
      await w.network.connect({ id: "forged-extension", url: "chrome-extension://feature-fixture/popup.html" }).send({
        v: CONTRACT_VERSION,
        build,
        id: "forged-native",
        kind: "ui.change",
        payload: { change: musicOn, windowId: 1 }
      })
    ).toBeUndefined()
    expect(w.batches).toEqual([])
    expect(w.settings().musicActions.on).toBe(false)
  } finally {
    await w.dispose()
  }
})

test("first-run selection retains its saved-on but held Music outcome", async () => {
  const w = world("native", {})
  try {
    await w.owner.ready()
    const read = await w.owner.readAgreement(w.origin)
    if (read.kind !== "review") throw Error("Expected first-run review")
    expect(
      await w.owner.agree(w.origin, {
        review: read.review,
        displayedVersion: read.version,
        choice: { kind: "first-run", selected: ["music-actions"], syncOn: false },
        access: Promise.resolve({ www: true, music: false, browserMenu: false })
      })
    ).toMatchObject({ kind: "committed" })
    expect(w.settings().musicActions.on).toBe(true)
    expect(object(w.h.records().device).consent).not.toBeNull()
  } finally {
    await w.dispose()
  }
})

test("retained-canonical startup holds incomplete cleanup and exact recovery preserves the archive", async () => {
  const h = createAuthorityHarness(),
    installed = await installAuthorityFixture(h)
  expect((await releaseAuthorityFixture(h, installed.owner)).kind).toBe("restart-required")
  await installed.owner.dispose()
  h.foreign(records => {
    object(object(object(records["doc:settings"]).data).autoAdd).on = true
    for (const acct of ["AAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBB"]) for (let shard = 0; shard < 16; shard++) records[`progress:${acct}:${shard}`] = { remembered: true }
  })
  const permissions = world("owner")
  const access = nativeSharedSettingsAccess(permissions.permissions)
  const owner = createStartingLocalFilterWriter({ ...h.actor("canonical-feature"), featureAccess: access, generation: () => "feature-stamp" })
  let archived: JsonValue | undefined
  try {
    expect(await owner.ready()).toBe("ok")
    archived = h.records().interimConversion
    h.write(async (items, apply) => {
      apply(items)
      if (Object.hasOwn(items, "doc:settings")) throw h.error
    })
    expect((await owner.changeFeatureSetting({ kind: "ui", windowId: 1, incognito: false }, { kind: "feature", feature: "auto-add", value: false })).kind).not.toBe("committed")
  } finally {
    await owner.dispose()
    h.write(undefined)
    await permissions.dispose()
  }
  const restarted = createStartingLocalFilterWriter({
    ...h.actor("canonical-feature-restart"),
    featureAccess: access,
    generation() {
      throw Error("Recovery cannot allocate a new stamp")
    }
  })
  try {
    await expect(restarted.ready()).rejects.toThrow()
    const ui = { kind: "ui", windowId: 1, incognito: false } as const
    const review = await restarted.readWithdrawnWork(ui)
    if (review.kind !== "held") throw Error("Expected canonical cleanup review")
    const job = review.work.find(row => row.kind === "feature-settings")
    if (job?.kind !== "feature-settings") throw Error("Expected canonical cleanup selection")
    expect((await restarted.recoverWithdrawnWork(ui, { review: review.review, job: job.selection })).kind).toBe("feature-settings-recovered")
    expect(h.records().interimConversion).toEqual(archived)
    for (const acct of ["AAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBB"]) for (let shard = 0; shard < 16; shard++) expect(h.records()[`progress:${acct}:${shard}`]).toEqual({})
  } finally {
    await restarted.dispose()
  }
}, 60_000)
