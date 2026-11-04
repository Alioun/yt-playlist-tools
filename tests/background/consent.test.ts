import { afterEach, expect, test } from "bun:test"
import { cleanup, render, screen } from "@testing-library/svelte"
import userEvent from "@testing-library/user-event"
import { fakeBrowser } from "wxt/testing/fake-browser"
import type { Background } from "../../src/background/boot"
import type { Backend } from "../../src/ui/backend/backend"
import { OnboardingPage } from "../../src/ui/onboarding"
import { startFirstRun } from "../../src/ui/onboarding/start"
import { englishI18n } from "../../tools/fixtures/localization/scripted"
import { acct, browser, documented, started } from "./world"

const running: Background[] = []
afterEach(async () => {
  cleanup()
  for (const background of running.splice(0)) await background.dispose().catch(() => {})
})

// A signed-in YouTube tab with the queue button on, whose site core has said hello and runs the feature.
async function queueButtonTab() {
  const world = browser({})
  await world.seed({ "doc:settings": documented("settings", { queueButton: { on: true, feedback: true } }) })
  world.tabs.open(1, "https://www.youtube.com/", { active: true })
  const w = world.worker()
  running.push(w.background)
  await started(w)
  const hello = (await w.hello(1)) as { result: { features: { id: string }[] } | null }
  expect(hello.result?.features.map(feature => feature.id)).toEqual(["queue-button"])
  return { world, w }
}

test("withdrawing consent in Settings sends every open YouTube tab a view with no features, so its site core tears them down", async () => {
  const { world, w } = await queueButtonTab()

  expect(await w.settings.call("ui.withdraw", { expected: { v: 1, at: 1 } })).toEqual({ kind: "answered", result: { kind: "withdrawn" } })
  expect(world.site.views.at(-1)).toMatchObject({ site: "www", signedIn: true, acct, features: [], statuses: [], notices: [] })
})

test("Clear all in Settings answers that it cleared this browser, after the open tab's features are torn down", async () => {
  const { world, w } = await queueButtonTab()

  const review = await w.settings.call("ui.clearAll", { action: "review", alsoSynced: false })
  if (review.kind !== "answered" || review.result.kind !== "reviewed") throw new Error(`No review: ${JSON.stringify(review)}`)
  const cleared = await w.settings.call("ui.clearAll", { action: "confirm", review: review.result.review, alsoSynced: false })
  expect(cleared).toMatchObject({ kind: "answered", result: { kind: "clear-result", scope: "local", erasure: "confirmed", outcome: "cleared", stage: "complete" } })
  expect(world.site.views.at(-1)).toMatchObject({ acct, features: [] })
  expect(await w.settings.call("ui.clearAll", { action: "review", alsoSynced: false }), "the fresh routes take the next request").toMatchObject({
    kind: "answered",
    result: { kind: "reviewed" }
  })
})

test("after withdrawing, Settings still reads paused work from the held store, also after the worker restarts, and features stay stopped", async () => {
  const { world, w } = await queueButtonTab()
  const read = { action: "read" } as const
  const work = { kind: "answered", result: { kind: "work", jobs: [] } } as const
  expect(await w.settings.call("ui.pausedWork", read)).toEqual(work)

  expect(await w.settings.call("ui.withdraw", { expected: { v: 1, at: 1 } })).toEqual({ kind: "answered", result: { kind: "withdrawn" } })
  expect(await w.settings.call("ui.pausedWork", read), "after withdrawal").toEqual(work)
  expect(await w.popup.call("ui.gather", {}), "Gather stays stopped").toMatchObject({ kind: "answered", result: { kind: "unavailable" } })

  await w.background.dispose()
  const again = world.worker()
  running.push(again.background)
  await again.background.ready
  expect(await again.settings.call("ui.pausedWork", read), "after the worker restarts").toEqual(work)
  expect(await again.popup.call("ui.gather", {}), "Gather stays stopped after the restart").toMatchObject({ kind: "answered", result: { kind: "unavailable" } })
})

test("while consent is held after a restart, Clear all in Settings still clears this browser", async () => {
  const { world, w } = await queueButtonTab()
  expect(await w.settings.call("ui.withdraw", { expected: { v: 1, at: 1 } })).toEqual({ kind: "answered", result: { kind: "withdrawn" } })
  await w.background.dispose()
  const again = world.worker()
  running.push(again.background)
  await again.background.ready

  const review = await again.settings.call("ui.clearAll", { action: "review", alsoSynced: false })
  if (review.kind !== "answered" || review.result.kind !== "reviewed") throw new Error(`No review: ${JSON.stringify(review)}`)
  const cleared = await again.settings.call("ui.clearAll", { action: "confirm", review: review.result.review, alsoSynced: false })
  expect(cleared).toMatchObject({ kind: "answered", result: { kind: "clear-result", erasure: "confirmed", outcome: "cleared" } })
})

// The first-run page in its own tab, which the popup's and Settings' Review opens.
function openFirstRunPage(backend: Backend) {
  const page = {
    backend,
    i18n: englishI18n(),
    platform: { browser: "chrome", os: "linux" } as const,
    private: false,
    windowId: null,
    version: "2.0.0",
    beta: false,
    open() {},
    openSettings() {},
    openFirstRun() {},
    applyTheme() {},
    canonical: async () => englishI18n(),
    commands: { read: async () => ({ kind: "unavailable" }) as const, named: async () => null }
  }
  render(OnboardingPage, { ...startFirstRun(page as never), markSrc: "mark.svg" })
}

test("after withdrawing, Review's page asks only to agree again, saves consent alone, and the features start with the next worker", async () => {
  const { world, w } = await queueButtonTab()
  expect(await w.settings.call("ui.withdraw", { expected: { v: 1, at: 1 } })).toEqual({ kind: "answered", result: { kind: "withdrawn" } })
  const settingsBefore = (await fakeBrowser.storage.local.get("doc:settings"))["doc:settings"]

  openFirstRunPage(w.onboarding)
  await screen.findByRole("heading", { name: "Before you continue" }, { timeout: 10_000 })
  expect(screen.getByText("You withdrew your consent, so Perchling reads nothing from YouTube. It kept your settings. Agree again to turn your features back on.")).toBeTruthy()
  await userEvent.click(screen.getByRole("button", { name: "Agree" }))
  await screen.findByText("You agreed again.", undefined, { timeout: 10_000 })

  const { device } = await fakeBrowser.storage.local.get("device")
  expect((device as { consent: { v: number; at: number } | null }).consent).toMatchObject({ v: 1 })
  expect((await fakeBrowser.storage.local.get("doc:settings"))["doc:settings"], "Agree changes no settings").toEqual(settingsBefore)
  expect(await w.popup.call("ui.gather", {}), "this worker's features stay stopped").toMatchObject({ kind: "answered", result: { kind: "unavailable" } })

  await w.background.dispose()
  const again = world.worker()
  running.push(again.background)
  await started(again)
  const hello = (await again.hello(1)) as { result: { features: { id: string }[] } | null }
  expect(
    hello.result?.features.map(feature => feature.id),
    "the next worker runs the features"
  ).toEqual(["queue-button"])
})

test("after withdrawing with the 1.x note still pending, Review's page asks only to agree again instead of showing the note", async () => {
  const details = {
    from: "1.4.5",
    autoAdd: { kept: 0, dropped: 0 },
    pct: { value: 50, wasUnset: false, authorised: true },
    feedback: true,
    shortcut: { raw: "", key: null, playlist: false, note: "none" },
    credentialsDeleted: true
  }
  const upgradeNote = { state: "pending", details, opened: true, seen: true, reopened: false }
  const world = browser({})
  await world.seed({ device: { id: "e2e-device", consent: { v: 1, at: 1 }, syncOn: false, upgradeNote } })
  const w = world.worker()
  running.push(w.background)
  await w.background.ready
  expect(await w.settings.call("ui.withdraw", { expected: { v: 1, at: 1 } })).toEqual({ kind: "answered", result: { kind: "withdrawn" } })

  openFirstRunPage(w.onboarding)
  await screen.findByText("You withdrew your consent, so Perchling reads nothing from YouTube. It kept your settings. Agree again to turn your features back on.", undefined, {
    timeout: 10_000
  })
  expect(screen.queryByText("YouTube Playlist Tools is now Perchling")).toBeNull()
  await userEvent.click(screen.getByRole("button", { name: "Agree" }))
  await screen.findByText("You agreed again.", undefined, { timeout: 10_000 })
  const { device } = await fakeBrowser.storage.local.get("device")
  expect(device, "the note waits for its own Agree once consent is back").toMatchObject({ consent: { v: 1 }, upgradeNote: { state: "pending" } })
})
