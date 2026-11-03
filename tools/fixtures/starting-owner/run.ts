import { createBrowserStartingLocalFilterWriter } from "../../../src/background/adapters/starting-owner"
import { nativeFirstRunAccess } from "../../../src/background/adapters/first-run"
import type { NativeSender } from "../../../src/background/adapters/sender-origin"
import { createFirstRunReceiver } from "../../../src/background/router/first-run"
import { firstRunContract, type FirstRunMessages } from "../../../src/shared/contracts/first-run"
import { isBuildId } from "../../../src/shared/contracts/vocabulary"
import { isAccountKey } from "../../../src/shared/model"
import { createMemoryNetwork } from "../../../src/shared/rpc/memory"
import { createRpc, type Deadline } from "../../../src/shared/rpc/rpc"
import { check, gate, startingOwnerFixture } from "./support"

export async function runStartingOwnerConsumer() {
  const h = startingOwnerFixture(),
    hold = gate()
  h.hooks.localRead = hold.wait
  const owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  const build = "starting-owner-fixture",
    acct = "AAAAAAAAAAAAAAAA"
  check(isBuildId(build) && isAccountKey(acct), "validated consumer identifiers")
  const sender: NativeSender = { id: "starting-extension", frameId: 0, url: "chrome-extension://starting-extension/popup.html" }
  const deadlines = new Set<() => void>()
  const deadline: Deadline = (_milliseconds, expire) => {
    deadlines.add(expire)
    return () => {
      deadlines.delete(expire)
    }
  }
  const network = createMemoryNetwork<NativeSender>({ delivery: "immediate" })
  const rpcOptions = { build, contract: firstRunContract, deadline }
  const background = createRpc<FirstRunMessages, NativeSender>(network.connect({}), rpcOptions)
  const ui = createRpc<FirstRunMessages, NativeSender>(network.connect(sender), rpcOptions)
  const receiver = createFirstRunReceiver({
    owner,
    sender: {
      runtime: { id: "starting-extension", getURL: path => `chrome-extension://starting-extension${path}` },
      windows: {
        async get(id) {
          return { id, incognito: false }
        }
      }
    },
    readAccess: nativeFirstRunAccess({
      async contains() {
        return true
      }
    }),
    lookup: {
      sync: {
        async get() {
          throw Error("No implicit consumer lookup")
        },
        subscribe() {
          throw Error("No implicit consumer subscription")
        }
      },
      clock: {
        now: () => 0,
        after() {
          throw Error("No implicit consumer timer")
        }
      },
      isCurrent: () => true
    }
  })
  const unhandle = background.handle(receiver.receiver)
  let heldStartup = false,
    duplicateRefused = false,
    confirmedChoice = false,
    sessionPersisted = false
  let initialReadiness: "pending" | "settled" = "pending"
  let settled = false
  const readiness = owner.ready().then(value => {
    settled = true
    return value
  })
  try {
    await hold.entered
    initialReadiness = settled ? "settled" : "pending"
    const pending = await owner.session.read()
    heldStartup = !settled && pending.kind === "unavailable" && pending.reason === "startup"
    check(heldStartup, "consumer records held canonical startup")
    try {
      createBrowserStartingLocalFilterWriter(h.native, h.options)
    } catch (error) {
      duplicateRefused = error instanceof Error && error.message === "Local storage already owned"
    }
    check(duplicateRefused, "consumer duplicate-owner refusal")
    hold.release()
    check((await readiness) === "ok", "consumer initial readiness resolves")
    const answer = await ui.call("ui.change", { windowId: 1, change: { kind: "first-run-agree", displayedVersion: 1, attempt: 1, selected: ["quick-save"], syncOn: false } })
    confirmedChoice = answer.kind === "answered" && answer.result.kind === "agreement" && answer.result.outcome.kind === "agreed"
    check(confirmedChoice, "real authenticated receiver confirms one first-run choice")
    const settings = await owner.read("settings")
    check(settings.kind === "value" && settings.settings.quickSave.on, "confirmed choice survives canonical settings read")
    const setup = await owner.readSetup(acct)
    check(setup.kind === "value" && setup.view.kind === "none", "real Setup read path consumes the same owner")
    const session = await owner.session.read()
    check(session.kind === "memory", "same owner's canonical session read")
    const changed = await owner.session.change({ revision: session.revision, now: 200, edits: [{ kind: "pause", paused: true }] })
    check(changed.kind === "committed", "same owner's confirmed session persistence")
    const reread = await owner.readSession()
    sessionPersisted = reread.kind === "memory" && reread.memory.paused && h.session().paused === true
    check(sessionPersisted, "native dummy session persists Pause")
    check(h.counts.rawLocal === 0 && h.counts.syncGet === 0 && h.counts.adds === 0 && h.timers.length === 0, "consumer uses supplied local and starts no sync")
  } finally {
    hold.release()
    receiver.dispose()
    unhandle()
    ui.dispose()
    background.dispose()
    await owner.dispose()
  }
  const after = await owner.session.read()
  const teardown = after.kind === "unavailable" && after.reason === "disposed" && network.listening() === 0 && deadlines.size === 0 && h.listeners.size === 0
  check(teardown, "real consumer teardown")
  return { fixture: "dummy-storage-only", initialReadiness, heldStartup, confirmedChoice, sessionPersisted, duplicateRefused, teardown, nativeGuarantees: "unproven", production: "held" }
}

if (import.meta.main) console.log(JSON.stringify(await runStartingOwnerConsumer()))
