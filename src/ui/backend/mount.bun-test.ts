import { expect, test } from "bun:test"
import { render } from "@testing-library/svelte"
import FirstRun from "../onboarding/FirstRun.svelte"
import { createFirstRunHarness } from "../../../tools/fixtures/first-run-backend/harness"

test("mounting the real FirstRun with its browser owner starts no pre-consent work", async () => {
  const h = await createFirstRunHarness()
  const view = h.openView()
  const before = { writes: h.store.batches.length, syncReads: h.stats().syncReads, messages: h.requestBytes.length, prompts: h.requests.length }
  const rendered = render(FirstRun, { owner: view.firstRun, text: view.text, markSrc: "brand/icon.svg" })
  try {
    await Promise.resolve()
    await Promise.resolve()
    expect({ writes: h.store.batches.length, syncReads: h.stats().syncReads, messages: h.requestBytes.length, prompts: h.requests.length }).toEqual(before)
  } finally {
    rendered.unmount()
    await h.dispose()
  }
})
