import { beforeEach, describe, expect, mock, test } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"

// The real 1.x module. It calls the auto-imported `browser` (no import line)
// and branches on import.meta.env.FIREFOX.
import { getRedirectURI } from "@/lib/auth"

const HASH = "35b64b676900f491c00e7f618d43f7040e88422e"

beforeEach(() => {
  // fakeBrowser has no in-memory identity API; add the one call auth.ts makes.
  Object.assign(fakeBrowser, {
    identity: { getRedirectURL: mock(() => `https://${HASH}.extensions.allizom.org/`) }
  })
})

describe("getRedirectURI", () => {
  test.if(import.meta.env.CHROME)("Chrome build: chromiumapp.org with the extension id", () => {
    expect(getRedirectURI()).toBe(`https://${fakeBrowser.runtime.id}.chromiumapp.org/`)
  })

  test.if(import.meta.env.FIREFOX)("Firefox build: the loopback form", () => {
    expect(getRedirectURI()).toBe(`http://127.0.0.1/mozoauth2/${HASH}`)
  })
})
