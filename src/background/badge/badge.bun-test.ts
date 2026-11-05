import { expect, test } from "bun:test"
import { badgeFor, everyTabBadge, type BadgeFacts } from "./badge"

const clear: BadgeFacts = { consentPending: false, accessMissing: false, marks: false, paused: false, notWorking: new Map(), ticked: new Set() }
const facts = (overrides: Partial<BadgeFacts>): BadgeFacts => ({ ...clear, ...overrides })

test.each([
  [
    "consent wins over everything",
    { consentPending: true, accessMissing: true, marks: true, paused: true, notWorking: new Map([[1, ["auto-add"]]]) },
    { text: "!", color: "violet", reason: "consent" }
  ],
  ["site access comes next", { accessMissing: true, marks: true, notWorking: new Map([[1, ["auto-add"]]]) }, { text: "!", color: "violet", reason: "access" }],
  ["not working is amber and only on its tab", { marks: true, notWorking: new Map([[1, ["queue-button"]]]) }, { text: "!", color: "amber", reason: "not-working", features: ["queue-button"] }],
  ["Missing or Full is violet", { marks: true, paused: true }, { text: "!", color: "violet", reason: "marks" }],
  ["paused wins over the tick", { paused: true, ticked: new Set([1]) }, { text: "II", color: "slate", reason: "paused" }],
  ["the tick shows on the tab whose video was added", { ticked: new Set([1]) }, { text: "✓", color: "teal", reason: "ticked" }],
  ["nothing to say shows nothing", {}, { text: "", color: null, reason: "none" }]
] as const)("%s", (_name, overrides, expected) => {
  expect(badgeFor(facts(overrides as Partial<BadgeFacts>), 1)).toEqual(expected as never)
})

test("a per-tab reason never reaches every tab", () => {
  const shown = facts({ notWorking: new Map([[1, ["auto-add"]]]), ticked: new Set([1]) })
  expect(everyTabBadge(shown)).toEqual({ text: "", color: null, reason: "none" })
  expect(badgeFor(shown, 2)).toEqual({ text: "", color: null, reason: "none" })
})

import { createToolbarBadge } from "../compose/badge"
import { scriptedMessages } from "../../../tools/fixtures/localization/scripted"

function driver(records: Record<string, unknown>, options: { www?: boolean; broken?: number[]; paused?: boolean } = {}) {
  const calls: string[] = []
  let fire: (() => void) | undefined
  const statuses = {
    async read(context: { tab: { tabId: number } }, enabled: readonly { id: string }[]) {
      return {
        kind: "statuses",
        facts: {} as never,
        current: () => true,
        statuses: enabled.map(feature => ({ feature: feature.id, state: options.broken?.includes(context.tab.tabId) ? "not-working" : "working", jobs: [], anchors: [], actions: [], kinds: [] }))
      }
    }
  }
  const badge = createToolbarBadge({
    action: {
      async setBadgeText(details) {
        calls.push(`text ${details.tabId ?? "all"} ${details.text}`)
      },
      async setBadgeBackgroundColor(details) {
        calls.push(`color ${details.tabId ?? "all"} ${details.color}`)
      },
      async setTitle(details) {
        calls.push(`title ${details.tabId ?? "all"} ${details.title}`)
      }
    },
    local: { get: async () => records },
    owner: {
      readSession: async () =>
        ({
          kind: "memory",
          revision: { reset: 0, accounts: new Map() },
          sequence: 1,
          memory: {
            paused: options.paused ?? false,
            tabs: new Map([
              [7, { site: "www", signedIn: false, acct: null }],
              [8, { site: "www", signedIn: false, acct: null }]
            ])
          }
        }) as never
    },
    access: async site => (site === "www" ? (options.www ?? true) : false),
    statuses: statuses as never,
    tab: async tabId => ({ kind: "tab", tab: { tabId, windowId: 1, incognito: false, site: "www", lastAccessed: 0, active: true, discarded: false, frozen: false } }) as never,
    build: "test" as never,
    i18n: scriptedMessages(),
    clock: {
      after(_ms, run) {
        fire = run
        return () => {
          fire = undefined
        }
      }
    }
  })
  return { badge, calls, fire: () => fire?.() }
}
const agreedRecords = { schema: 1, device: { id: "d", consent: { v: 1, at: 1 }, syncOn: false } }

test("before consent every tab shows a violet ! titled that Perchling is waiting", async () => {
  const { badge, calls } = driver({ schema: 1, device: { id: "d", consent: null, syncOn: false } })
  await badge.refresh()
  expect(calls).toEqual(["text all !", "color all #7b5cd6", "title all Perchling is waiting for your OK"])
})

test("a feature not working shows an amber ! on its tab only, and clears back to every tab's badge", async () => {
  const records = { ...agreedRecords, "doc:settings": { v: 1, gen: "g", at: 1, by: "d", data: { queueButton: { on: true, feedback: true, corner: "top-left" } } } }
  const broken = driver(records, { broken: [7] })
  await broken.badge.refresh()
  expect(broken.calls).toEqual(["text 7 !", "color 7 #c27803", "title 7 Queue button on thumbnails isn't working in this tab"])
})

test("site access missing for a switched-on feature shows a violet ! everywhere", async () => {
  const { badge, calls } = driver({ ...agreedRecords, "doc:settings": { v: 1, gen: "g", at: 1, by: "d", data: { queueButton: { on: true, feedback: true, corner: "top-left" } } } }, { www: false })
  await badge.refresh()
  expect(calls).toEqual(["text all !", "color all #7b5cd6", "title all Perchling needs site access"])
})

test("a key's answer shows for 3 s over everything, then the tab returns to its badge", async () => {
  const { badge, calls, fire } = driver(agreedRecords)
  await badge.refresh()
  badge.flash(7, false, "No YouTube tab is playing a video.")
  await Bun.sleep(0)
  expect(calls).toEqual(["text 7 ✕", "color 7 #d14343", "title 7 No YouTube tab is playing a video."])
  calls.length = 0
  fire()
  await Bun.sleep(0)
  expect(calls.slice(0, 2)).toEqual(["text 7 null", "title 7 null"])
})

const autoAdd = (toolbarTick: boolean) => ({
  ...agreedRecords,
  "doc:settings": { v: 1, gen: "g", at: 1, by: "d", data: { autoAdd: { on: true, feedback: true, pct: 73, toolbarTick, toolbarPaused: true } } }
})

test("auto-add's tick shows on its tab until the video changes, and not while the tick option is off or auto-add is paused", async () => {
  const { badge, calls } = driver(autoAdd(true))
  await badge.refresh()
  badge.tick(7)
  await badge.refresh()
  expect(calls).toEqual(["text 7 ✓", "color 7 #14a39a", "title 7 Auto-added this tab's video"])
  calls.length = 0
  badge.untick(7)
  await Bun.sleep(0)
  await badge.refresh()
  expect(calls).toEqual(["text 7 null", "title 7 null"])
  for (const quiet of [driver(autoAdd(false)), driver(autoAdd(true), { paused: true })]) {
    await quiet.badge.refresh()
    quiet.calls.length = 0
    quiet.badge.tick(7)
    await quiet.badge.refresh()
    expect(quiet.calls).toEqual([])
  }
})

test("a stopped worker forgets its ticks, so the tab's video changing still clears the tab's own badge", async () => {
  const { badge, calls } = driver(autoAdd(true))
  await badge.refresh()
  badge.untick(8)
  await Bun.sleep(0)
  expect(calls).toEqual(["text 8 null", "title 8 null"])
})
