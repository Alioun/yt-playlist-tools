import { expect, test } from "bun:test"
import { createLocalFilterWriter } from "./local-filter-writer"
import { createRemovalHarness, removalFixture } from "../../../tools/fixtures/account-removal-execution/run"

const popup = { kind: "ui", windowId: 1, incognito: false } as const

test("Discard deletes the unclaimed 1.x setup once and leaves everything else", async () => {
  const initial = removalFixture()
  initial.local.unclaimed = { from: "1.4.5", autoAdd: ["PL_from_one_x"], shortcutPlaylist: null, filters: {}, at: 1 }
  const removal = createRemovalHarness(initial)
  const owner = createLocalFilterWriter(removal.deps)
  try {
    expect(await owner.discardUnclaimed(popup)).toEqual({ kind: "discarded" })
    expect(removal.state().local).toEqual({ ...initial.local, unclaimed: null })
    expect(await owner.discardUnclaimed(popup)).toEqual({ kind: "absent" })
    expect(await owner.discardUnclaimed({ kind: "tab", tabId: 1, incognito: false } as never)).toEqual({ kind: "refused", reason: "invalid" })
  } finally { await owner.dispose() }
})
