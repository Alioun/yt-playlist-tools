import { expect, test } from "bun:test"
import { nativeSharedSettingsAccess, type SharedSettingsPermissionPort } from "./shared-settings"

function permissions(held: boolean) {
  const calls: string[] = []
  const port: SharedSettingsPermissionPort = {
    async contains() {
      calls.push("contains")
      return held
    },
    async remove() {
      calls.push("remove")
      held = false
      return true
    }
  }
  return { port, calls }
}

test("an optional browser-menu permission is removed and confirmed gone", async () => {
  const { port, calls } = permissions(true)
  expect(await nativeSharedSettingsAccess(port, true).releaseBrowserMenu()).toEqual({ kind: "released" })
  expect(calls).toEqual(["remove", "contains"])
})

test("a required browser-menu permission has nothing to give back", async () => {
  const { port, calls } = permissions(true)
  expect(await nativeSharedSettingsAccess(port, false).releaseBrowserMenu()).toEqual({ kind: "released" })
  expect(calls).toEqual([])
})
