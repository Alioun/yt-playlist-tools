import { expect, test } from "bun:test"
import { pageViewKeeps, readPageView } from "./page-view"

const records = (join?: unknown) => ({
  schema: 1, device: { id: "d", consent: { v: 1, at: 1 }, syncOn: true },
  sync: { joined: "history", pushed: {}, status: "ok", editedSinceOff: false },
  ...join === undefined ? {} : { "pending:sync-join": join }
})
const status = (view: ReturnType<typeof readPageView>) => view.kind === "view" ? view.sync?.status : view.kind

test("while the join question waits for an answer, pages read the sync status as waiting (SYNC-08, SYNC-24)", () => {
  expect(pageViewKeeps("pending:sync-join")).toBe(true)
  expect(status(readPageView(records()))).toBe("ok")
  expect(status(readPageView(records({ v: 2, kind: "sync-join", phase: "choice" })))).toBe("waiting")
  expect(status(readPageView(records({ v: 2, kind: "sync-join", phase: "outbound" })))).toBe("ok")
})
