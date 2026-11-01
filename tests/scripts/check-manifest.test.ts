import { describe, expect, test } from "bun:test"
import { perchlingManifest } from "../../build/manifest"
import { buildOf, checkManifests, expectedManifest } from "../../scripts/check-manifest"

const version = "1.99.1"
const wxtAdds = (browser: "chrome" | "firefox") => ({
  manifest_version: 3, version,
  background: browser === "firefox" ? { scripts: ["background.js"] } : { service_worker: "background.js" },
  options_ui: { page: "options.html", open_in_tab: true }
})
function built(browser: "chrome" | "firefox", mode = "production") {
  const manifest = perchlingManifest({ browser, mode }) as Record<string, unknown>
  const action = { ...(manifest.action as object), default_popup: "popup.html" }
  return { ...manifest, ...wxtAdds(browser), action }
}
function check(directory: string, manifest: unknown) {
  return checkManifests([directory], version, () => JSON.stringify(manifest))
}

describe("check:manifest", () => {
  test("the builder's manifests, with WXT's own keys, pass for Chrome, Firefox and the Firefox beta", () => {
    expect(check(".output/chrome-mv3", built("chrome"))).toEqual([])
    expect(check(".output/firefox-mv3", built("firefox"))).toEqual([])
    expect(check(".output/firefox-mv3-beta", built("firefox", "beta"))).toEqual([])
  })

  test("both browsers ask only for www.youtube.com and offer music.youtube.com as optional access (G21)", () => {
    for (const browser of ["chrome", "firefox"] as const) {
      const manifest = expectedManifest({ browser, beta: false }, version)
      expect(manifest.host_permissions).toEqual(["https://www.youtube.com/*"])
      expect(manifest.optional_host_permissions).toEqual(["https://music.youtube.com/*"])
    }
  })

  test.each([
    ["a permission the spec never requests", (m: Record<string, unknown>) => ({ ...m, permissions: ["storage", "scripting", "tabs"] })],
    ["a content script", (m: Record<string, unknown>) => ({ ...m, content_scripts: [{ matches: ["https://www.youtube.com/*"], js: ["x.js"] }] })],
    ["web-accessible resources", (m: Record<string, unknown>) => ({ ...m, web_accessible_resources: [] })],
    ["a version that isn't package.json's", (m: Record<string, unknown>) => ({ ...m, version: "1.5.0" })],
    ["a command with a suggested key", (m: Record<string, unknown>) => ({ ...m, commands: { ...(m.commands as object), "save-playing-song": { description: "x", suggested_key: { default: "Alt+S" } } } })],
    ["the broad Firefox host", (m: Record<string, unknown>) => ({ ...m, host_permissions: ["*://*.youtube.com/*"] })],
    ["a missing default locale", (m: Record<string, unknown>) => { const { default_locale: _, ...rest } = m; return rest }]
  ])("rejects %s", (_name, mutate) => {
    expect(check(".output/firefox-mv3", mutate(built("firefox")))).not.toEqual([])
  })

  test("only the Firefox beta build may carry the update URL", () => {
    expect(check(".output/firefox-mv3", built("firefox", "beta"))).toEqual([
      expect.stringContaining("firefox-mv3: browser_specific_settings is")
    ])
    expect(check(".output/firefox-mv3-beta", built("firefox"))).toHaveLength(1)
    expect(() => buildOf(".output/chrome-mv3-beta")).toThrow("Only Firefox has a beta build")
    expect(() => buildOf(".output/edge-mv3")).toThrow("Don't know how to check edge-mv3")
  })
})
