import { objectShape } from "../../../src/shared/contracts/object-shape"
import { CONTRACT_VERSION } from "../../../src/shared/contracts/protocol"
import { isBuildId } from "../../../src/shared/contracts/vocabulary"
import { isAccountKey, type AccountKey } from "../../../src/shared/model/validation"
import type { AccountData, Job, JobInvocation } from "../../../src/shared/contracts/jobs"
import {
  tabHelloMessages,
  tabJobMessages,
  tabMessages,
  tabPingMessages,
  type TabHello,
  type TabHelloMessages,
  type TabJobMessages,
  type TabMessages,
  type TabPingMessages,
  type TabViewScope
} from "../../../src/shared/contracts/tabs"
import { createMemoryNetwork } from "../../../src/shared/rpc/memory"
import { createRpc, createRpcCaller } from "../../../src/shared/rpc/rpc"
import { createExtLink } from "../../../src/site/core/extlink"
import { build, checked, harness as pageHarness } from "../page-link/support"

export { build, checked }
export type FixtureSender = { readonly id?: string }
export const extensionId = "synthetic-extlink-extension"
export const otherAccount = checked(isAccountKey, "BBBBBBBBBBBBBBBB")
export type FixtureView = TabViewScope & {
  readonly fixture: { readonly owner: AccountKey | null; readonly revision: number }
}
export function isFixtureView(value: unknown): value is FixtureView {
  const fields = {
    private: (v: unknown) => typeof v === "boolean",
    build: isBuildId,
    fixture: (v: unknown) =>
      objectShape(v, {
        owner: owner => owner === null || isAccountKey(owner),
        revision: n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0
      })
  }
  if (!(objectShape(value, { ...fields, signedIn: v => v === true, acct: isAccountKey }) || objectShape(value, { ...fields, signedIn: v => v === false, acct: v => v === null }))) return false
  return objectShape(value.fixture, { owner: v => v === value.acct, revision: n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 })
}
export function fixtureView(account: AccountData, revision = 0): FixtureView {
  const scope = account.signedIn ? ({ signedIn: true, acct: account.acct } as const) : ({ signedIn: false, acct: null } as const)
  return { ...scope, private: false, build, fixture: { owner: scope.acct, revision } }
}
export async function settle() {
  for (let i = 0; i < 200; i++) await Promise.resolve()
}

export function extlinkHarness(
  options: {
    readonly page?: Parameters<typeof pageHarness>[0]
    readonly hiddenAtStart?: boolean
    readonly delivery?: "immediate" | "queued"
    readonly hello?: (hello: TabHello) => Promise<FixtureView | null>
    readonly isView?: (value: unknown) => value is FixtureView
  } = {}
) {
  const page = pageHarness(options.page)
  const network = createMemoryNetwork<FixtureSender>({ delivery: options.delivery ?? "immediate" })
  const background = network.connect({ id: extensionId })
  const site = network.connect({ id: extensionId })
  let identity: string | undefined = extensionId
  let throws = false
  const hellos: TabHello[] = []
  const hello = createRpc<TabHelloMessages<FixtureView>, FixtureSender>(background, {
    build,
    deadline: page.clock.after.bind(page.clock),
    contract: tabHelloMessages(isFixtureView)
  })
  hello.handle({
    authenticate: ({ sender }) => (sender.id === extensionId ? { kind: "accepted", context: null } : { kind: "rejected" }),
    handlers: {
      "tab.hello": value => {
        hellos.push(value)
        return options.hello ? options.hello(value) : fixtureView(value)
      }
    }
  })
  const ext = createExtLink({
    build,
    site: "www",
    page: page.link,
    deadline: page.clock.after.bind(page.clock),
    hiddenAtStart: options.hiddenAtStart ?? true,
    isView: options.isView ?? isFixtureView,
    runtime: {
      transport: site,
      identity() {
        if (throws) throw Error("Synthetic orphan")
        return identity
      },
      senderId: sender => sender.id
    }
  })
  const owned = new Set<() => void>()
  const deadline = page.clock.after.bind(page.clock)
  function ping() {
    const caller = createRpcCaller<TabPingMessages>(background, { build, deadline, contract: tabPingMessages() })
    owned.add(caller.dispose)
    return caller.call("bg.ping", {}).finally(() => {
      owned.delete(caller.dispose)
      caller.dispose()
    })
  }
  function view(value: FixtureView) {
    const caller = createRpcCaller<TabMessages<FixtureView>>(background, { build, deadline, contract: tabMessages(isFixtureView) })
    owned.add(caller.dispose)
    return caller.call("bg.view", value).finally(() => {
      owned.delete(caller.dispose)
      caller.dispose()
    })
  }
  function run<J extends Job>(invocation: JobInvocation<J>, milliseconds = 30_000) {
    const caller = createRpcCaller<TabJobMessages<J>>(background, { build, deadline, contract: tabJobMessages(invocation, milliseconds) })
    owned.add(caller.dispose)
    return caller.call("bg.job", invocation).finally(() => {
      owned.delete(caller.dispose)
      caller.dispose()
    })
  }
  return {
    page,
    network,
    background,
    ext,
    hellos,
    ping,
    view,
    run,
    raw(kind: string, payload: unknown, sender: FixtureSender = { id: extensionId }) {
      return network.connect(sender).send({ v: CONTRACT_VERSION, build, id: "raw", kind, payload })
    },
    setIdentity(value: string | undefined) {
      identity = value
    },
    throwIdentity() {
      throws = true
    },
    dispose() {
      ext.dispose()
      hello.dispose()
      for (const stop of owned) stop()
      owned.clear()
      page.dispose()
    }
  }
}
