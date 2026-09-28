import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"

import { getRedirectURI } from "@/lib/auth"

/**
 * Runs only in the `firefox` vitest project, where import.meta.env.FIREFOX is
 * true. This branch is worth pinning on the real build flag rather than by
 * stubbing a constant: the pre-migration code shipped only the Chrome form,
 * which made sign-in impossible on the extension's primary platform.
 */

// sha1("...") of the extension id -- this is the subdomain Firefox derives.
const HASH = "35b64b676900f491c00e7f618d43f7040e88422e"

beforeEach(() => {
  Object.assign(fakeBrowser, {
    identity: {
      getRedirectURL: vi.fn(() => `https://${HASH}.extensions.allizom.org/`)
    }
  })
})

describe("getRedirectURI on the Firefox build", () => {
  it("is actually running with FIREFOX set", () => {
    // Guards the harness itself: WxtVitest's own globals define is dropped
    // under Vitest, so this is substituted by the wxtTestGlobals plugin in
    // vitest.config.ts. If that regresses, every assertion below would still
    // pass against the Chrome branch and quietly prove nothing.
    expect(import.meta.env.FIREFOX).toBe(true)
    expect(import.meta.env.BROWSER).toBe("firefox")
  })

  it("uses the 127.0.0.1 loopback form derived from getRedirectURL()", () => {
    // Google refuses to verify ownership of allizom.org, so the extensions.
    // allizom.org URL cannot be registered. Firefox has accepted this loopback
    // form since v86 and intercepts it before it hits the network.
    expect(getRedirectURI()).toBe(`http://127.0.0.1/mozoauth2/${HASH}`)
  })

  it("has no trailing slash", () => {
    // Deliberately unlike the Chrome form. Google matches byte-for-byte, so
    // adding one here breaks Firefox sign-in with redirect_uri_mismatch.
    expect(getRedirectURI().endsWith("/")).toBe(false)
  })

  it("never emits the unregistrable allizom.org host", () => {
    expect(getRedirectURI()).not.toContain("allizom.org")
  })
})
