import { expect, test } from "bun:test"
import { createStoreStartupHost } from "./startup-source"
import { nativeStartupInventory } from "./startup-inventory"

const dummy = { clientID: "DUMMY_CLIENT", clientSecret: "DUMMY_SECRET", accessToken: "DUMMY_ACCESS", refreshToken: "DUMMY_REFRESH" }
const stored = (extra: Record<string, unknown> = {}) => ({ ...dummy, playlists: [{ id: "PLsynthetic", title: "Synthetic" }], toastEnabled: true, ...extra })

test("the inventory names credential keys but carries no credential value, only whether the refresh token was set", async () => {
  const inventory = await nativeStartupInventory({ get: async () => stored() }).readInventory()
  expect(inventory.presentLocalKeys).toEqual(expect.arrayContaining(["clientSecret", "accessToken", "refreshToken", "playlists"]))
  expect(JSON.stringify(inventory)).not.toContain("DUMMY")
  expect(inventory.legacyAuthorization).toEqual({ kind: "observed", refreshTokenWasNonempty: true })
  expect(inventory.values).toEqual({ playlists: [{ id: "PLsynthetic", title: "Synthetic" }], toastEnabled: true })
})

test("an empty or absent refresh token reads as not set, and the startup host accepts the inventory", async () => {
  for (const refreshToken of ["", undefined]) {
    const source = nativeStartupInventory({ get: async () => stored({ refreshToken }) })
    expect((await source.readInventory()).legacyAuthorization).toEqual({ kind: "observed", refreshTokenWasNonempty: false })
  }
  const host = createStoreStartupHost({
    context: { deviceId: "device", settingsGen: "generation", at: 1, shortcutId: "abc123", platform: { browser: "chrome", os: "linux" }, commands: [] },
    source: nativeStartupInventory({ get: async () => stored() }),
    cleanup: { removeLocal: async () => {}, deleteDatabase: async () => {}, removeSession: async () => {} }
  })
  const snapshot = await host.readSnapshot()
  expect(snapshot.legacy.presentKeys).toEqual(expect.arrayContaining(["refreshToken", "accessToken"]))
  expect(JSON.stringify(snapshot)).not.toContain("DUMMY")
})
