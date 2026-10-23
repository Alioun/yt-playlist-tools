import { expect, it, vi } from "vitest"
import { ContentScriptContext } from "wxt/utils/content-script-context"
import { fakeBrowser } from "wxt/testing/fake-browser"
import content from "@/entrypoints/youtube.content"
import * as store from "@/lib/storage"

it("does not read the page, mount UI or ask the background for data before consent", async () => {
  const ctx = new ContentScriptContext("youtube-test")
  const read = vi.spyOn(document, "querySelector")
  const send = vi.spyOn(fakeBrowser.runtime, "sendMessage")
  try {
    await content.main(ctx)
    expect(read).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(globalThis.__ytptStop).toBeUndefined()
  } finally { ctx.notifyInvalidated() }
})

it("stops initialization after revoke while account discovery is pending", async () => {
  await store.sessionGeneration.setValue("test-generation")
  await store.sessionConsent.setValue(store.CONSENT_VERSION)
  const ctx = new ContentScriptContext("youtube-revoke-test")
  let finish: ((result: unknown) => void) | undefined
  const waiting = new Promise(resolve => { finish = resolve })
  const send = vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(() => waiting)
  const query = vi.spyOn(document, "querySelector")
  try {
    const init = content.main(ctx)
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({ action: "sessionForTab" }))
    await store.sessionConsent.setValue(-1)
    await vi.waitFor(() => expect(globalThis.__ytptStop).toBeUndefined())
    finish?.({ kind: "ready", session: { accountKey: "account0000000001" } })
    await init
    expect(query).not.toHaveBeenCalledWith("video")
    expect(document.querySelector("yt-playlist-tools-toaster")).toBeNull()
  } finally { ctx.notifyInvalidated() }
})


it("invalidates initialization when consent rotates even if access is already regranted", async () => {
  await store.sessionGeneration.setValue("old-generation")
  await store.sessionConsent.setValue(store.CONSENT_VERSION)
  const ctx = new ContentScriptContext("youtube-generation-test")
  let finish: ((result: unknown) => void) | undefined
  const waiting = new Promise(resolve => { finish = resolve })
  const send = vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(() => waiting)
  try {
    const init = content.main(ctx)
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({ action: "sessionForTab" }))
    await store.sessionGeneration.setValue("new-generation")
    await vi.waitFor(() => expect(globalThis.__ytptStop).toBeUndefined())
    finish?.({ kind: "signedOut" })
    await init
    expect(document.querySelector("yt-playlist-tools-toaster")).toBeNull()
  } finally { ctx.notifyInvalidated() }
})
