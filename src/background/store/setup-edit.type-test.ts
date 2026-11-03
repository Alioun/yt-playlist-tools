import { executeSetupDestination, type SetupDestinationResult, type SetupEditPorts } from "./setup-edit-execution"
import {
  expectDestination,
  parseSetupDestinationChange,
  planSetupDestination,
  readAccountSetup,
  type AccountSetupView,
  type SetupDestination,
  type SetupDestinationChange,
  type SetupDestinationExpectation,
  type SetupEvent
} from "./setup-edit"
import type { createLocalFilterWriter, SettingsEvent, SetupRead } from "./local-filter-writer"
import type { executeSharedSetting } from "./shared-setting-execution"
import type { RemovalCapture, RemovalResult } from "./account-removal-execution"
import type { AccountKey, PlaylistId, ShortcutId } from "../../shared/model"
import type { Origin } from "../../shared/contracts/results"
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Check<T extends true> = T
type Writer = ReturnType<typeof createLocalFilterWriter>
export type SetupEditProofs = [
  Check<Equal<keyof typeof import("./setup-edit-execution"), "executeSetupDestination" | "executeSetupEdit">>,
  Check<
    Equal<
      keyof typeof import("./setup-edit"),
      "parseSetupDestinationChange" | "readAccountSetup" | "expectDestination" | "planSetupDestination" | "planSetupAccountChoice" | "parseSetupMarkRequest" | "planSetupMarks"
    >
  >,
  Check<Equal<Parameters<Writer["markPlaylists"]>, [request: import("./setup-edit").SetupMarkRequest]>>,
  Check<Equal<ReturnType<Writer["markPlaylists"]>, Promise<SetupDestinationResult>>>,
  Check<
    Equal<
      SetupEditPorts,
      Parameters<typeof executeSharedSetting>[0] & { readonly remove: (capture: RemovalCapture, expectedRecords: import("../../shared/contracts/json").JsonObject) => Promise<RemovalResult> }
    >
  >,
  Check<Equal<Parameters<Writer["changeSetupDestination"]>, [origin: Extract<Origin, { kind: "ui" }>, change: SetupDestinationChange]>>,
  Check<Equal<ReturnType<Writer["changeSetupDestination"]>, Promise<SetupDestinationResult>>>,
  Check<Equal<Parameters<Writer["readSetup"]>, [acct: AccountKey]>>,
  Check<Equal<ReturnType<Writer["readSetup"]>, Promise<SetupRead>>>,
  Check<Equal<Parameters<Parameters<Writer["subscribe"]>[0]>[0], SettingsEvent>>,
  Check<Equal<Parameters<Parameters<Writer["subscribeSetup"]>[0]>[0], SetupEvent>>,
  Check<Equal<SetupDestination["kind"], "quick-save" | "music-save" | "gather" | "shortcut">>,
  Check<Equal<string extends SetupDestinationChange["acct"] ? true : false, false>>,
  Check<Equal<string extends NonNullable<SetupDestinationChange["playlist"]> ? true : false, false>>,
  Check<Equal<string extends Extract<SetupDestination, { kind: "shortcut" }>["shortcut"] ? true : false, false>>,
  Check<Equal<Extract<Origin, { kind: "tab" | "background" | "sync" }> extends Parameters<Writer["changeSetupDestination"]>[0] ? true : false, false>>,
  Check<Equal<Extract<SetupDestinationResult, { kind: "committed" }>["view"], AccountSetupView>>,
  Check<Equal<Extract<SetupEvent, { kind: "setup-changed" }>["source"], "local" | "sync">>
]

function boundaries(input: {
  writer: Writer
  ports: SetupEditPorts
  acct: AccountKey
  playlist: PlaylistId
  shortcut: ShortcutId
  view: AccountSetupView
  result: SetupDestinationResult
  read: SetupRead
  origin: Extract<Origin, { kind: "ui" }>
}) {
  const { writer, ports, acct, playlist, shortcut, view, result, read, origin } = input
  const fresh: SetupDestinationChange = { acct, destination: { kind: "quick-save" }, expected: { setup: "none" }, playlist }
  const target: SetupDestinationChange = { acct, destination: { kind: "shortcut", shortcut }, expected: expectDestination(view, { kind: "shortcut", shortcut }), playlist: null }
  void writer.changeSetupDestination(origin, fresh)
  void writer.changeSetupDestination({ kind: "ui", windowId: 1, incognito: true }, target)
  void executeSetupDestination(ports, target)
  void writer.readSetup(acct)
  void parseSetupDestinationChange({ untrusted: true })
  void planSetupDestination
  void readAccountSetup
  // @ts-expect-error Accounts require the validated brand.
  void writer.readSetup("AAAAAAAAAAAAAAAA")
  // @ts-expect-error Playlists require the validated brand.
  const rawPlaylist: SetupDestinationChange = { ...fresh, playlist: "PL_raw" }
  // @ts-expect-error Shortcuts require the validated brand.
  const rawShortcut: SetupDestination = { kind: "shortcut", shortcut: "short1" }
  // @ts-expect-error A shortcut destination names its shortcut.
  const anonymous: SetupDestination = { kind: "shortcut" }
  // @ts-expect-error Auto-add rows, labels and marks are not destinations.
  const label: SetupDestination = { kind: "label" }
  // @ts-expect-error A destination change cannot replace a whole setup.
  const whole: SetupDestinationChange = { ...fresh, setup: { quickSave: playlist } }
  // @ts-expect-error A capture without a setup has no destination playlist.
  const noneWithPlaylist: SetupDestinationExpectation = { setup: "none", playlist }
  // @ts-expect-error A live capture states the destination it saw.
  const liveWithout: SetupDestinationExpectation = { setup: "live" }
  // @ts-expect-error The account and expectation are required.
  const unaddressed: SetupDestinationChange = { destination: { kind: "gather" }, playlist }
  // @ts-expect-error Tab, background and sync callers are not accepted before router authentication.
  void writer.changeSetupDestination({ kind: "tab", tabId: 1, incognito: false }, fresh)
  // @ts-expect-error Settings subscribers never receive Setup events.
  writer.subscribe((event: SetupEvent) => void event)
  // @ts-expect-error Setup subscribers never receive Settings events.
  writer.subscribeSetup((event: SettingsEvent) => void event)
  // @ts-expect-error Committed results carry their confirmed view.
  const bare: SetupDestinationResult = { kind: "committed" }
  // @ts-expect-error A plain ok result cannot claim persistence.
  const optimistic: SetupDestinationResult = { kind: "result", result: { ok: true } }
  // @ts-expect-error Unconfirmed rejection keeps its original error.
  const lost: SetupDestinationResult = { kind: "unconfirmed", cause: { kind: "rejected" } }
  const emptyCommit: SetupDestinationResult = { kind: "committed", view: { kind: "none", acct } }
  // @ts-expect-error An absent view has no Setup body.
  const absentBody: SetupDestinationResult = { kind: "committed", view: { kind: "none", acct, setup: {} } }
  // @ts-expect-error A live view requires its confirmed Setup body.
  const missingBody: SetupDestinationResult = { kind: "committed", view: { kind: "live", acct } }
  // @ts-expect-error A partial removal cannot claim successful cleanup.
  const optimisticRemoval: SetupDestinationResult = { kind: "removal", result: { kind: "committed" } }
  if (result.kind === "committed") {
    // @ts-expect-error Narrow live versus absent before reading a Setup body.
    void result.view.setup
  }
  // @ts-expect-error Discriminate before reading a failure.
  void result.error
  // @ts-expect-error Results are immutable.
  result.kind = "unchanged"
  if (read.kind === "value") {
    // @ts-expect-error Read views are immutable snapshots.
    if (read.view.kind === "live") read.view.setup.quickSave = playlist
    // @ts-expect-error Read views are immutable snapshots.
    if (read.view.kind === "live") read.view.setup.targets[shortcut] = playlist
  }
  void [rawPlaylist, rawShortcut, anonymous, label, whole, noneWithPlaylist, liveWithout, unaddressed, bare, optimistic, lost, emptyCommit, absentBody, missingBody, optimisticRemoval]
}
void boundaries
