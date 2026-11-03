import { createBrowserStartingLocalFilterWriter, type BrowserStartingOwner, type BrowserStartingOwnerOptions } from "./starting-owner"
import type { createStartingLocalFilterWriter } from "../store/local-filter-writer"
import type { FirstRunReceiverPorts } from "../router/first-run"
import type { SessionPort, SessionChange } from "../store/session-memory"
import type { TabViewPorts } from "../tab-view/producer"
import type { TabsPorts } from "../tabs/ports"
import type { Ports as AddFlowPorts } from "../add-flow/add-flow"

type NativeBrowser = typeof import("wxt/browser").browser
type Dependencies = Parameters<typeof createStartingLocalFilterWriter>[0]
type StartingOwner = ReturnType<typeof createStartingLocalFilterWriter>
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Check<T extends true> = T
export type CompleteOwnerMethods = Check<{ [Name in keyof StartingOwner]: Equal<BrowserStartingOwner[Name], StartingOwner[Name]> }[keyof StartingOwner]>
export type CanonicalSessionRead = Check<Equal<BrowserStartingOwner["session"]["read"], StartingOwner["readSession"]>>
export type CanonicalSessionChange = Check<Equal<BrowserStartingOwner["session"]["change"], StartingOwner["changeSession"]>>

function boundaries(
  native: NativeBrowser,
  options: BrowserStartingOwnerOptions,
  owner: BrowserStartingOwner,
  change: SessionChange,
  claim: Extract<Dependencies["claim"], { kind: "fixture" }>,
  removal: Extract<NonNullable<Dependencies["removal"]>, { kind: "fixture" }>,
  join: Extract<NonNullable<Dependencies["join"]>, { kind: "fixture" }>,
  recovery: Extract<NonNullable<Dependencies["recovery"]>, { kind: "fixture" }>,
  canonicalAuthority: Extract<NonNullable<Dependencies["canonicalAuthority"]>, { kind: "fixture" }>
) {
  const canonical: StartingOwner = owner
  const receiver: FirstRunReceiverPorts["owner"] = owner
  const session: SessionPort = owner.session
  const tabs: TabsPorts["session"] = owner.session
  const tabView: TabViewPorts["owner"] = owner
  const addFlow: AddFlowPorts["session"] = owner.session
  const setup: Pick<StartingOwner, "readSetup" | "subscribeSetup" | "changeSetupDestination"> = owner
  void [canonical, receiver, session, tabs, tabView, addFlow, setup]
  void createBrowserStartingLocalFilterWriter(native, options)
  const completeImport: import("../store/settings-import-execution").SettingsImportOwner = owner
  void completeImport
  const { local: _local, ...withoutLocal } = options
  const { startup: _startup, ...withoutStartup } = options
  // @ts-expect-error Missing safe local is not a native raw-storage fallback.
  void createBrowserStartingLocalFilterWriter(native, withoutLocal)
  // @ts-expect-error Missing startup cannot construct a preinitialized owner.
  void createBrowserStartingLocalFilterWriter(native, withoutStartup)
  // @ts-expect-error Session accepts canonical edits rather than arbitrary storage keys.
  void owner.session.change({ ...change, edits: [{ kind: "invented-session-key", value: true }] })
  // @ts-expect-error The session facade exposes no raw storage writer.
  void owner.session.set({ paused: true })
  // @ts-expect-error Invented methods cannot appear on the complete derived owner.
  void owner.activateNativeAuthority()
  // @ts-expect-error Fixture claim authority cannot enter native configuration.
  void createBrowserStartingLocalFilterWriter(native, { ...options, claim })
  // @ts-expect-error Fixture removal authority cannot enter native configuration.
  void createBrowserStartingLocalFilterWriter(native, { ...options, removal })
  // @ts-expect-error Fixture join authority cannot enter native configuration.
  void createBrowserStartingLocalFilterWriter(native, { ...options, join })
  // @ts-expect-error Fixture recovery authority cannot enter native configuration.
  void createBrowserStartingLocalFilterWriter(native, { ...options, recovery })
  // @ts-expect-error Fixture canonical authority cannot enter native configuration.
  void createBrowserStartingLocalFilterWriter(native, { ...options, canonicalAuthority })
  const settingsImport: Extract<NonNullable<Dependencies["settingsImport"]>, { kind: "fixture" }> = {
    kind: "fixture",
    removeLocal: async () => {},
    session: removal.session
  }
  // @ts-expect-error Fixture import cleanup cannot enter native configuration.
  void createBrowserStartingLocalFilterWriter(native, { ...options, settingsImport })
}
void boundaries
