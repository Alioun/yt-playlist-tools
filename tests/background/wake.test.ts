import { afterEach, expect, test } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"
import type { Background } from "../../src/background/boot"
import { browser, documented, eventually, started, video, watch } from "./world"

const running: Background[] = []
afterEach(async () => {
  for (const background of running.splice(0)) await background.dispose().catch(() => {})
  fakeBrowser.reset()
})

const registry = async () => Object.keys(((await fakeBrowser.storage.session.get("tabs")) as { tabs?: Record<string, unknown> }).tabs ?? {})
const settings = (patch: Record<string, unknown>) => ({ "doc:settings": documented("settings", patch) })

// The browser stops an idle worker and starts a new one for the next message, key or menu click.
// A just woken worker is that new one, and the test's next step is the first thing it hears.
async function watching(mode: "running" | "just woken", seed: Record<string, unknown> = {}) {
  const world = browser({})
  await world.seed(seed)
  world.tabs.open(1, watch(1), { active: true })
  const first = world.worker()
  running.push(first.background)
  await started(first)
  await first.hello(1)
  await eventually(async () => (await registry()).includes("1"), "the tab's registry row")
  if (mode === "running") return { world, worker: first }
  await first.background.dispose()
  const worker = world.worker()
  running.push(worker.background)
  return { world, worker }
}

for (const mode of ["running", "just woken"] as const) {
  test(`Check now runs its reads in a ${mode} worker`, async () => {
    const { worker } = await watching(mode)
    const answer = await worker.settings.call("ui.diagnostics", { check: true })
    expect(answer).toMatchObject({ kind: "answered", result: { kind: "diagnostics", tabs: { www: true }, checks: [{ site: "www", jobs: expect.arrayContaining([{ job: "account", ok: true }]) }] } })
  })

  test(`a key from any tab saves the playing video in a ${mode} worker`, async () => {
    const { world: w, worker } = await watching(mode, settings({ anyTabKeys: { on: true, feedback: true } }))
    w.site.play(video(1))
    const commands = worker.native.commands as unknown as { onCommand: { listeners: Set<(name: string) => void> } }
    for (const listener of [...commands.onCommand.listeners]) listener("watch-later-current-video")
    await eventually(() => [...w.site.later.values()].includes(video(1)), "the video in Watch later")
    await eventually(() => w.badges.some(badge => JSON.stringify(badge) === JSON.stringify(["text", { text: "✓", tabId: 1 }])), "the ✓ on the toolbar icon")
  })

  for (const end of ["closes", "goes to another site"] as const) {
    test(`a status read in a ${mode} worker drops the registry row of a tab that ${end} (ARC-ACC-70)`, async () => {
      const { world: w, worker } = await watching(mode)
      // The background hears no tab event, so only a status read can find the tab gone.
      if (end === "closes") await w.tabs.native.remove([1])
      else w.tabs.tabs.get(1)!.url = "https://example.com/"
      expect((await worker.settings.call("ui.status", {})).kind).toBe("answered")
      await eventually(async () => (await registry()).length === 0, "the row to go")
    })
  }
}

test("a tab whose hello wakes the worker is registered", async () => {
  const w = browser({})
  await w.seed()
  w.tabs.open(1, watch(1), { active: true })
  const worker = w.worker()
  running.push(worker.background)
  await worker.hello(1)
  await eventually(async () => (await registry()).includes("1"), "the tab's registry row")
})

test("a worker that starts with Save from the browser's menu on draws the menu (YT-BM-02)", async () => {
  const w = browser({})
  await w.seed(settings({ browserMenu: { on: true, feedback: true } }))
  const worker = w.worker()
  running.push(worker.background)
  const native = worker.native as unknown as {
    permissions: { contains(request: { permissions?: string[] }): Promise<boolean> }
    contextMenus: { removeAll(): Promise<void>; create(item: { id: string }): void }
  }
  const contains = native.permissions.contains.bind(native.permissions)
  native.permissions.contains = async request => request.permissions?.join() === "contextMenus" || contains(request)
  // The browser keeps the menu across worker stops, so a start that clears it and draws nothing leaves the user without it.
  let drawn = ["pp-save", "pp-save-quick", "pp-save-later", "pp-save-choose"]
  native.contextMenus.removeAll = async () => {
    drawn = []
  }
  native.contextMenus.create = item => {
    drawn.push(item.id)
  }
  await started(worker)
  await new Promise(resolve => setTimeout(resolve, 100))
  expect(drawn).toEqual(["pp-save", "pp-save-quick", "pp-save-later", "pp-save-choose"])
})

test("agreeing at first run with Save from the browser's menu ticked draws the menu (YT-BM-02)", async () => {
  // A fresh install, in a browser that already holds the menu permission, as Firefox does.
  const w = browser({})
  const worker = w.worker()
  running.push(worker.background)
  const native = worker.native as unknown as {
    permissions: { contains(request: { permissions?: string[] }): Promise<boolean> }
    contextMenus: { removeAll(): Promise<void>; create(item: { id: string }): void }
  }
  const contains = native.permissions.contains.bind(native.permissions)
  native.permissions.contains = async request => request.permissions?.join() === "contextMenus" || contains(request)
  let drawn: string[] = []
  native.contextMenus.removeAll = async () => {
    drawn = []
  }
  native.contextMenus.create = item => {
    drawn.push(item.id)
  }
  await started(worker)
  const agreed = await worker.onboarding.call("ui.change", { change: { kind: "first-run-agree", displayedVersion: 1, attempt: 1, selected: ["browser-menu"], syncOn: false } })
  expect(agreed).toMatchObject({ kind: "answered", result: { outcome: { kind: "agreed", applications: [{ feature: "browser-menu", state: "enabled" }] } } })
  await eventually(() => drawn.length === 4, "the menu")
  expect(drawn).toEqual(["pp-save", "pp-save-quick", "pp-save-later", "pp-save-choose"])
})
