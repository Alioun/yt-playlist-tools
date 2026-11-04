import { afterEach, expect, test } from "bun:test"
import type { Background } from "../../src/background/boot"
import { acct, browser, documented, started } from "./world"

const running: Background[] = []
afterEach(async () => {
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
