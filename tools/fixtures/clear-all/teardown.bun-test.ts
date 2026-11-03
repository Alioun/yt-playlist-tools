import { expect, test } from "bun:test"
import { createClearAllTeardown } from "../../../src/background/adapters/store-lifecycle"
import { createRegistrar } from "../../../src/background/registrar/registrar"
import { scriptedRegistrar } from "../registrar/scripted"
import { tabsFixture } from "../tabs/harness"
import { extlinkHarness } from "../extlink/harness"

test("composed real Registrar Tabs and ExtLink teardown", async () => {
  const registrarFixture = scriptedRegistrar(),
    registrar = createRegistrar(registrarFixture.ports)
  const tabs = tabsFixture(),
    link = extlinkHarness()
  let drained = false,
    tornDown = false,
    menuReleased = false
  const teardown = createClearAllTeardown({
    registrar,
    tabs: tabs.engine,
    extLinks: [link.ext],
    scripting: registrarFixture.ports.scripting,
    async drainInvokedWork() {
      drained = true
      return "drained"
    },
    async tearDownAllOpenTabs() {
      tornDown = true
      return "torn-down"
    },
    async releaseBrowserMenu() {
      menuReleased = true
      return "released"
    }
  })
  try {
    expect(await teardown.quiesce()).toEqual({ kind: "confirmed", scripts: "absent", tabs: "torn-down", browserMenu: "released" })
    expect([drained, tornDown, menuReleased]).toEqual([true, true, true])
    expect(link.ext.state.kind).toBe("disposed")
    expect(tabs.calls.some(call => call.kind === "dispose")).toBe(true)
    expect(registrarFixture.listenerCounts).toEqual([0, 0, 0])
  } finally {
    registrar.dispose()
    link.dispose()
    await tabs.dispose()
  }
})
