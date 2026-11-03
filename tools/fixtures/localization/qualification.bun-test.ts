import { expect, test } from "bun:test"
import catalogue from "../../../src/public/_locales/en/messages.json"
import { createBrowserI18n } from "../../../src/ui/backend/browser"
import { createFirstRunOwner, type FirstRunServices } from "../../../src/ui/backend/first-run-owner"
import { createFirstRunHarness } from "../first-run-backend/harness"
import { pseudoFirstRunText, scriptedMessages } from "./scripted"

test("the native message boundary keeps its receiver and refuses invalid results", () => {
  const scripted = scriptedMessages()
  const native = {
    i18n: {
      getUILanguage: () => "en",
      getMessage(name: string, substitutions?: string | string[]) {
        expect(this).toBe(native.i18n)
        return scripted.getMessage(name, substitutions)
      }
    }
  }
  expect(createBrowserI18n(native, catalogue).message("copy_list_two", { first: "A", second: "B" })).toBe("A and B")
  expect(() => createBrowserI18n({ i18n: { getMessage: undefined, getUILanguage: () => "en" } }, catalogue)).toThrow("Native localization getMessage is unavailable")
  const invalid = createBrowserI18n({ i18n: { getMessage: () => 7, getUILanguage: () => "en" } }, catalogue)
  expect(() => invalid.message("firstRun_welcome")).toThrow("Native localization result is not text")
})

test("a pseudo-localized displayed snapshot cannot grant real agreement", async () => {
  const h = await createFirstRunHarness()
  const view = h.openView()
  const text = pseudoFirstRunText()
  let serviceCalls = 0
  const services: FirstRunServices = {
    account: {
      async read() {
        serviceCalls++
        return { kind: "signed-out" }
      }
    },
    playlists: {
      async title() {
        serviceCalls++
        return undefined
      }
    },
    chooser: {
      async choose() {
        serviceCalls++
        return { kind: "unavailable" }
      }
    },
    open() {
      serviceCalls++
    }
  }
  const owner = createFirstRunOwner(view.backend, services, { browser: "chrome", os: "linux" }, text)
  try {
    expect(await owner.agree({ displayed: text.disclosure, attempt: 1, selected: ["quick-save"], syncOn: false, permissions: Promise.resolve({ music: true, browserMenu: true }) })).toEqual({
      kind: "not-agreed",
      attempt: 1,
      reason: "unavailable"
    })
    expect(h.requestBytes).toEqual([])
    expect(h.store.batches).toEqual([])
    expect(serviceCalls).toBe(0)
  } finally {
    owner.dispose()
    await h.dispose()
  }
})
