import { expect, test } from "bun:test"
import { openUpgradeNote } from "./note-opener"

function ports(note: Record<string, unknown> | null) {
  const opened: string[] = []
  return { opened, ports: { device: async () => ({ id: "d", consent: null, syncOn: false, upgradeNote: note }),
    open: async () => { opened.push("tab"); return true }, async mark(flag: "opened" | "seen" | "reopened") { opened.push(flag); return "set" as const } } }
}
const pending = { state: "pending", opened: false, seen: false, reopened: false, details: {} }

test("the note opens once after the migration, in a tab, and is marked opened", async () => {
  const { opened, ports: p } = ports(pending)
  expect(await openUpgradeNote(p, false)).toBe("opened")
  expect(opened).toEqual(["tab", "opened"])
})

test("a note nobody saw reopens once at a browser start, and never on a background restart", async () => {
  const unseen = ports({ ...pending, opened: true })
  expect(await openUpgradeNote(unseen.ports, false)).toBe("none")
  expect(await openUpgradeNote(unseen.ports, true)).toBe("reopened")
  expect(unseen.opened).toEqual(["tab", "reopened"])
  for (const note of [{ ...pending, opened: true, seen: true }, { ...pending, opened: true, reopened: true }, { ...pending, state: "done", opened: true }]) {
    const { opened, ports: p } = ports(note)
    expect(await openUpgradeNote(p, true)).toBe("none")
    expect(opened).toEqual([])
  }
})
