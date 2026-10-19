// The only WXT-specific preload a module with explicit imports needs.
//
// WxtVitest stubs the `browser` and `chrome` globals with fakeBrowser
// (wxt/dist/core/builders/vite/plugins/extensionApiMock.mjs). @wxt-dev/browser,
// which wxt/browser and @wxt-dev/storage both import, reads
// `globalThis.browser` once, when it is first evaluated, so this has to run
// in a preload, before any test file imports them.
import { beforeEach } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"

Object.assign(globalThis, { browser: fakeBrowser, chrome: fakeBrowser })

// fakeBrowser is one in-memory instance for the whole run.
beforeEach(() => {
  fakeBrowser.reset()
})
