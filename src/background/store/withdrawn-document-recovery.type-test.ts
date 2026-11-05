import {
  executeExactRetainedFilter,
  readExactFilterSync,
  type ExactRetainedFilterPermit,
  type RetainedFilterJobIdentity,
  type RetainedFilterDescriptor,
  type AcceptedFilterRecord,
  type CompletedFilterRecord,
  type RegisteredFilterWitness,
  type ConsentRetainedFilterJob,
  type FilterTerminalPorts,
  type FilterRecoveryPorts,
  type RetainedFilterExecution
} from "./withdrawn-document-recovery"
import {
  executeExactRetainedAgreement,
  executeExactRetainedInstallation,
  executeExactRetainedV1Acceptance,
  executeExactRetainedInstallationAcceptance,
  type ExactRemovalPermit,
  type ExactRetainedAgreementPermit,
  type ExactRetainedV1AcceptancePermit,
  type ExactRetainedInstallationPermit,
  type ExactRetainedInstallationAcceptancePermit,
  type ExactRecoveryResult,
  type ConsentJobs
} from "./consent-recovery"
import type { createLocalFilterWriter } from "./local-filter-writer"
import type { JsonObject } from "../../shared/contracts/json"
import type { PlaylistRestoreEffect } from "./interim-recovery-execution"
import type { InstalledRetainedInstallationV3, AcceptedRetainedInstallationV3 } from "./interim-installation"
import {
  executeExactRetainedPlaylist,
  readExactPlaylistSync,
  type ExactRetainedPlaylistPermit,
  type RetainedPlaylistJobIdentity,
  type RetainedPlaylistDescriptor,
  type AcceptedPlaylistRecord,
  type CompletedPlaylistRecord,
  type RegisteredPlaylistWitness,
  type ConsentRetainedPlaylistJob,
  type PlaylistTerminalPorts,
  type PlaylistRecoveryPorts,
  type RetainedPlaylistExecution,
  type RetainedPlaylistView
} from "./withdrawn-document-recovery"
import type { FilterReplacementEffect } from "./interim-recovery-execution"
type LocalFilterWriter = ReturnType<typeof createLocalFilterWriter>

function positive(
  permit: ExactRetainedFilterPermit,
  ports: FilterRecoveryPorts,
  terminal: FilterTerminalPorts,
  identity: RetainedFilterJobIdentity,
  accepted: AcceptedFilterRecord,
  completed: CompletedFilterRecord,
  confirmed: Extract<RetainedFilterExecution, { kind: "confirmed" }>,
  owner: LocalFilterWriter
) {
  const descriptor: RetainedFilterDescriptor = { kind: "retained-filter-replacement", deviceId: identity.deviceId, accepted }
  const witness: RegisteredFilterWitness = { descriptor, registration: { kind: "registered", occurrence: identity.occurrence } }
  const job: ConsentRetainedFilterJob = { identity, progress: { kind: "accepted" }, permission: { kind: "held" } }
  const ledger: ConsentJobs = { v: 1, kind: "consent-jobs", deviceId: identity.deviceId, next: identity.occurrence + 1, jobs: [job], retainedDocuments: [witness] }
  const result: ExactRecoveryResult = { kind: "recovered", job: identity, completion: { operation: "retained-filter-replacement", result: confirmed }, remaining: [] }
  void executeExactRetainedFilter(permit, ports)
  void readExactFilterSync(permit, async () => ({}))
  void terminal.setLedger(ledger)
  void terminal.setCompleted(completed)
  void owner.readWithdrawnWork({ kind: "ui", windowId: 1, incognito: false })
  void result
}
function negative(
  filter: ExactRetainedFilterPermit,
  removal: ExactRemovalPermit,
  receipt: ExactRetainedAgreementPermit,
  v1: ExactRetainedV1AcceptancePermit,
  installation: ExactRetainedInstallationPermit,
  acceptance: ExactRetainedInstallationAcceptancePermit,
  identity: RetainedFilterJobIdentity,
  accepted: AcceptedFilterRecord,
  completed: CompletedFilterRecord,
  installed: InstalledRetainedInstallationV3 & JsonObject,
  ports: FilterRecoveryPorts,
  terminal: FilterTerminalPorts,
  playlist: PlaylistRestoreEffect,
  owner: LocalFilterWriter,
  ledger: ConsentJobs
) {
  // @ts-expect-error Public JSON cannot construct the private filter permit.
  const fabricated: ExactRetainedFilterPermit = {}
  // @ts-expect-error A durable armed permission is not process-local filter authority.
  executeExactRetainedFilter({ kind: "armed", generation: 2, current: { v: 1, at: 300 } }, ports)
  // @ts-expect-error Removal permits cannot execute filters.
  executeExactRetainedFilter(removal, ports)
  // @ts-expect-error V2 receipt permits cannot execute filters.
  executeExactRetainedFilter(receipt, ports)
  // @ts-expect-error V1 acceptance permits cannot execute filters.
  executeExactRetainedFilter(v1, ports)
  // @ts-expect-error Installation permits cannot execute filters.
  executeExactRetainedFilter(installation, ports)
  // @ts-expect-error Installation acceptance authority cannot execute a filter.
  executeExactRetainedFilter(acceptance, ports)
  // @ts-expect-error Filter permits cannot execute receipts.
  executeExactRetainedAgreement(filter, { setLedger: terminal.setLedger, setConfirmed: async () => {} })
  // @ts-expect-error Filter permits cannot execute V1 acceptance.
  executeExactRetainedV1Acceptance(filter, { setAccepted: async () => {} })
  // @ts-expect-error Filter permits cannot execute installation.
  executeExactRetainedInstallation(filter, { setLedger: terminal.setLedger, setDocuments: async () => {}, setInstalled: async () => {} })
  // @ts-expect-error Filter authority cannot accept an installation.
  executeExactRetainedInstallationAcceptance(filter, { setAccepted: async () => {} })
  // @ts-expect-error Terminal authority has no document writer.
  terminal.setFilter(accepted.pending.effect)
  // @ts-expect-error Terminal authority has no history writer.
  terminal.setHistory(accepted.pending.effect.history.after)
  // @ts-expect-error Exact filter ports cannot write Device.
  const devicePort: FilterRecoveryPorts = { ...ports, setDevice: async (_raw: JsonObject) => {} }
  // @ts-expect-error Completed records cannot become accepted descriptors.
  const completedDescriptor: RetainedFilterDescriptor = { kind: "retained-filter-replacement", deviceId: identity.deviceId, accepted: completed }
  // @ts-expect-error A completed filter in this unit cannot use an installed-V3 basis.
  const v3Completion: CompletedFilterRecord = { ...completed, basis: { ...completed.basis, checkpoint: installed } }
  // @ts-expect-error An accepted filter replacement keeps its confirmed-V2 basis.
  const v3FilterBasis: typeof accepted.basis.checkpoint = installed
  // @ts-expect-error An accepted record cannot be submitted as completed.
  terminal.setCompleted(accepted)
  // @ts-expect-error Playlist effects cannot be submitted to the fixed filter writer.
  ports.setFilter(playlist)
  // @ts-expect-error Selected immutable identities cannot change destination.
  identity.operation.record.pending.effect.key.acct = playlist.key.acct
  // @ts-expect-error Terminal progress cannot have held permission.
  const heldTerminal: ConsentRetainedFilterJob = { identity, progress: { kind: "terminal" }, permission: { kind: "held" } }
  // @ts-expect-error Accepted progress cannot have retiring permission.
  const retiringAccepted: ConsentRetainedFilterJob = { identity, progress: { kind: "accepted" }, permission: { kind: "retiring", generation: 1, current: identity.original } }
  // @ts-expect-error Host generation strings cannot become numeric consent generations.
  const hostGeneration: ConsentRetainedFilterJob = { identity, progress: { kind: "accepted" }, permission: { kind: "armed", generation: "host-consent-1", current: identity.original } }
  // @ts-expect-error The original agreement has a validated numeric timestamp.
  const wrongOriginal: RetainedFilterJobIdentity = { ...identity, original: { v: 1, at: "300" } }
  // @ts-expect-error A snapshot locator must have a validated numeric path.
  const stringLocator: AcceptedFilterRecord = { ...accepted, pending: { kind: "filter-replacement", effect: { ...accepted.pending.effect, item: { sourceKey: "filters", path: ["0"] } } } }
  // @ts-expect-error An occurrence cannot be omitted from a registered witness.
  const noOccurrence: RegisteredFilterWitness = { descriptor: { kind: "retained-filter-replacement", deviceId: identity.deviceId, accepted }, registration: { kind: "registered" } }
  // @ts-expect-error A public recovery input cannot contain an effect.
  owner.recoverWithdrawnWork({ kind: "ui", windowId: 1, incognito: false }, { review: { kind: "withdrawn-work-review" }, job: { kind: "held-job-selection" }, effect: accepted.pending.effect })
  // @ts-expect-error A public recovery input cannot choose an account.
  owner.recoverWithdrawnWork({ kind: "ui", windowId: 1, incognito: false }, { review: { kind: "withdrawn-work-review" }, job: { kind: "held-job-selection" }, acct: playlist.key.acct })
  const mixed: ExactRecoveryResult = {
    kind: "recovered",
    job: identity,
    // @ts-expect-error A filter completion cannot use installation operation correlation.
    completion: { operation: "retained-installation", result: { kind: "confirmed", identity, original: identity.original, current: identity.original, activation: "held", mutations: [] } },
    remaining: []
  }
  const failed: ExactRecoveryResult = {
    kind: "recovered",
    job: identity,
    // @ts-expect-error A failed filter execution cannot be recovered.
    completion: { operation: "retained-filter-replacement", result: { kind: "failed", identity, stage: "documents", write: { kind: "rejected", error: null }, mutations: [] } },
    remaining: []
  }
  // @ts-expect-error There is no ledger-only acceptance repair port in this unit.
  ports.setAcceptance({ interimConversion: accepted, "consent:jobs": ledger })
  // @ts-expect-error Document witnesses cannot register an unaccepted predecessor.
  const unregistered: RegisteredFilterWitness = { descriptor: { kind: "retained-filter-replacement", deviceId: identity.deviceId, accepted }, registration: { kind: "unregistered", expectedNext: 0 } }
  void [
    fabricated,
    devicePort,
    completedDescriptor,
    v3Completion,
    v3FilterBasis,
    heldTerminal,
    retiringAccepted,
    hostGeneration,
    wrongOriginal,
    stringLocator,
    noOccurrence,
    mixed,
    failed,
    unregistered
  ]
}
void [positive, negative]

function playlistPositive(
  permit: ExactRetainedPlaylistPermit,
  ports: PlaylistRecoveryPorts,
  terminal: PlaylistTerminalPorts,
  identity: RetainedPlaylistJobIdentity,
  accepted: AcceptedPlaylistRecord,
  completed: CompletedPlaylistRecord,
  confirmed: Extract<RetainedPlaylistExecution, { kind: "confirmed" }>,
  owner: LocalFilterWriter
) {
  const descriptor: RetainedPlaylistDescriptor = { kind: "retained-playlist-restore", deviceId: identity.deviceId, accepted }
  const witness: RegisteredPlaylistWitness = { descriptor, registration: { kind: "registered", occurrence: identity.occurrence } }
  const job: ConsentRetainedPlaylistJob = { identity, progress: { kind: "accepted" }, permission: { kind: "held" } }
  const ledger: ConsentJobs = { v: 1, kind: "consent-jobs", deviceId: identity.deviceId, next: identity.occurrence + 1, jobs: [job], retainedDocuments: [witness] }
  const result: ExactRecoveryResult = { kind: "recovered", job: identity, completion: { operation: "retained-playlist-restore", result: confirmed }, remaining: [] }
  void executeExactRetainedPlaylist(permit, ports)
  void readExactPlaylistSync(permit, async () => ({}))
  void terminal.setLedger(ledger)
  void terminal.setCompleted(completed)
  void owner.restoreInterimPlaylist({ kind: "ui", windowId: 1, incognito: false }, { choice: { kind: "interim-playlist-destination-choice" }, acct: accepted.pending.effect.key.acct })
  void result
}
type InstalledPlaylistRecord = Extract<AcceptedPlaylistRecord, { readonly basis: { readonly checkpoint: { readonly v: 3 } } }>
type InstalledCompletedPlaylistRecord = Extract<CompletedPlaylistRecord, { readonly basis: { readonly checkpoint: { readonly v: 3 } } }>
function installedPlaylistPositive(
  installedAccepted: InstalledPlaylistRecord,
  installedCompleted: InstalledCompletedPlaylistRecord,
  accepted: AcceptedPlaylistRecord,
  installed: InstalledRetainedInstallationV3 & JsonObject,
  identity: RetainedPlaylistJobIdentity,
  terminal: PlaylistTerminalPorts,
  confirmed: Extract<RetainedPlaylistExecution, { kind: "confirmed" }>
) {
  const reachable: [InstalledPlaylistRecord, InstalledCompletedPlaylistRecord] extends [never, unknown] | [unknown, never] ? false : true = true
  const basis: typeof accepted.basis.checkpoint = installed
  const accepting = installedAccepted.basis.checkpoint.agreed.agreement.effect
  const installedIdentity: RetainedPlaylistJobIdentity = {
    deviceId: identity.deviceId,
    occurrence: identity.occurrence,
    operation: { kind: "retained-playlist-restore", record: installedAccepted },
    original: accepting.consent
  }
  const descriptor: RetainedPlaylistDescriptor = { kind: "retained-playlist-restore", deviceId: identity.deviceId, accepted: installedAccepted }
  const witness: RegisteredPlaylistWitness = { descriptor, registration: { kind: "registered", occurrence: installedIdentity.occurrence } }
  const job: ConsentRetainedPlaylistJob = { identity: installedIdentity, progress: { kind: "terminal" }, permission: { kind: "retiring", generation: 2, current: identity.original } }
  const local: { readonly kind: "off" } = installedAccepted.pending.effect.admission
  const scope: { readonly kind: "this-browser" } = installedAccepted.pending.effect.scope
  const result: ExactRecoveryResult = {
    kind: "recovered",
    job: installedIdentity,
    completion: { operation: "retained-playlist-restore", result: { ...confirmed, identity: installedIdentity, original: accepting.consent } },
    remaining: []
  }
  void terminal.setCompleted(installedCompleted)
  void [reachable, basis, witness, job, local, scope, result]
}
function playlistNegative(
  permit: ExactRetainedPlaylistPermit,
  filter: ExactRetainedFilterPermit,
  removal: ExactRemovalPermit,
  receipt: ExactRetainedAgreementPermit,
  v1: ExactRetainedV1AcceptancePermit,
  installation: ExactRetainedInstallationPermit,
  acceptance: ExactRetainedInstallationAcceptancePermit,
  identity: RetainedPlaylistJobIdentity,
  accepted: AcceptedPlaylistRecord,
  completed: CompletedPlaylistRecord,
  filterRecord: AcceptedFilterRecord,
  acceptedInstallation: AcceptedRetainedInstallationV3 & JsonObject,
  installedAccepted: InstalledPlaylistRecord,
  ports: PlaylistRecoveryPorts,
  terminal: PlaylistTerminalPorts,
  filterPorts: FilterRecoveryPorts,
  effect: FilterReplacementEffect,
  owner: LocalFilterWriter
) {
  // @ts-expect-error Public JSON cannot construct a playlist permit.
  const fabricated: ExactRetainedPlaylistPermit = {}
  // @ts-expect-error A copied display token cannot construct a playlist permit.
  executeExactRetainedPlaylist({ kind: "held-job-selection" }, ports)
  // @ts-expect-error Durable permission cannot execute a playlist effect.
  executeExactRetainedPlaylist({ kind: "armed", generation: 2, current: identity.original }, ports)
  // @ts-expect-error Filter authority cannot execute playlist recovery.
  executeExactRetainedPlaylist(filter, ports)
  // @ts-expect-error Removal authority cannot execute playlist recovery.
  executeExactRetainedPlaylist(removal, ports)
  // @ts-expect-error Receipt authority cannot execute playlist recovery.
  executeExactRetainedPlaylist(receipt, ports)
  // @ts-expect-error V1 authority cannot execute playlist recovery.
  executeExactRetainedPlaylist(v1, ports)
  // @ts-expect-error Installation authority cannot execute playlist recovery.
  executeExactRetainedPlaylist(installation, ports)
  // @ts-expect-error Installation acceptance cannot execute playlist recovery.
  executeExactRetainedPlaylist(acceptance, ports)
  // @ts-expect-error Filter authority cannot read playlist sync.
  readExactPlaylistSync(filter, async () => ({}))
  // @ts-expect-error Removal authority cannot read playlist sync.
  readExactPlaylistSync(removal, async () => ({}))
  // @ts-expect-error Receipt authority cannot read playlist sync.
  readExactPlaylistSync(receipt, async () => ({}))
  // @ts-expect-error V1 authority cannot read playlist sync.
  readExactPlaylistSync(v1, async () => ({}))
  // @ts-expect-error Installation authority cannot read playlist sync.
  readExactPlaylistSync(installation, async () => ({}))
  // @ts-expect-error Installation acceptance cannot read playlist sync.
  readExactPlaylistSync(acceptance, async () => ({}))
  // @ts-expect-error Playlist authority cannot execute filter recovery.
  executeExactRetainedFilter(permit, filterPorts)
  // @ts-expect-error Playlist authority cannot read filter sync.
  readExactFilterSync(permit, async () => ({}))
  // @ts-expect-error Playlist authority cannot execute removal recovery.
  executeExactRetainedAgreement(permit, { async set() {} })
  // @ts-expect-error Playlist authority cannot execute V1 recovery.
  executeExactRetainedV1Acceptance(permit, { async set() {} })
  // @ts-expect-error Playlist authority cannot execute installation recovery.
  executeExactRetainedInstallation(permit, { async set() {} })
  // @ts-expect-error Playlist authority cannot execute installation acceptance.
  executeExactRetainedInstallationAcceptance(permit, { async set() {} })
  // @ts-expect-error Terminal ports cannot write playlists.
  terminal.setPlaylist(accepted.pending.effect)
  // @ts-expect-error Terminal ports cannot write filters.
  terminal.setFilter(effect)
  // @ts-expect-error Terminal ports cannot write history.
  terminal.setHistory({})
  // @ts-expect-error Terminal ports cannot write Device.
  terminal.setDevice({})
  // @ts-expect-error Terminal ports cannot write Settings.
  terminal.setSettings({})
  // @ts-expect-error Terminal ports cannot write accepting records.
  terminal.setAcceptance(accepted)
  // @ts-expect-error Filter effects cannot enter the playlist writer.
  ports.setPlaylist(effect)
  // @ts-expect-error Playlist effects cannot enter the filter writer.
  filterPorts.setFilter(accepted.pending.effect)
  // @ts-expect-error Filter accepted records cannot become playlist descriptors.
  const filterDescriptor: RetainedPlaylistDescriptor = { kind: "retained-playlist-restore", deviceId: identity.deviceId, accepted: filterRecord }
  // @ts-expect-error Completed records cannot become accepted playlist descriptors.
  const completedDescriptor: RetainedPlaylistDescriptor = { kind: "retained-playlist-restore", deviceId: identity.deviceId, accepted: completed }
  // @ts-expect-error An accepted but uninstalled V3 is not a playlist basis.
  const uninstalled: typeof accepted.basis.checkpoint = acceptedInstallation
  // @ts-expect-error The accepting agreement is basis-specific, so an unnarrowed basis has no V2 agreement path.
  void accepted.basis.checkpoint.agreement
  // @ts-expect-error An installed-V3 playlist effect is local-only and cannot gain synced admission.
  const syncedV3: typeof installedAccepted.pending.effect.admission = { kind: "synced", joined: "joined", requiredRepairs: [] }
  // @ts-expect-error An installed-V3 playlist effect cannot widen to syncing browsers.
  const syncingV3: typeof installedAccepted.pending.effect.scope = { kind: "syncing-browsers", joined: "joined" }
  // @ts-expect-error Accepted records cannot be written as completed records.
  terminal.setCompleted(accepted)
  // @ts-expect-error Accepted progress cannot have retiring permission.
  const retiring: ConsentRetainedPlaylistJob = { identity, progress: { kind: "accepted" }, permission: { kind: "retiring", generation: 2, current: identity.original } }
  // @ts-expect-error Accepted progress cannot have done permission.
  const done: ConsentRetainedPlaylistJob = { identity, progress: { kind: "accepted" }, permission: { kind: "done" } }
  // @ts-expect-error Terminal progress cannot have held permission.
  const held: ConsentRetainedPlaylistJob = { identity, progress: { kind: "terminal" }, permission: { kind: "held" } }
  // @ts-expect-error A completed view cannot be unregistered.
  const unregistered: RetainedPlaylistView = {
    kind: "retained-playlist-restore",
    selection: { kind: "held-job-selection" },
    identity,
    current: identity.original,
    recoverability: "exact-retained-document",
    registration: "unregistered",
    checkpoint: "completed",
    progress: "terminal"
  }
  // @ts-expect-error A completed view cannot have accepted progress.
  const acceptedView: RetainedPlaylistView = {
    kind: "retained-playlist-restore",
    selection: { kind: "held-job-selection" },
    identity,
    current: identity.original,
    recoverability: "exact-retained-document",
    registration: "registered",
    checkpoint: "completed",
    progress: "accepted"
  }
  // @ts-expect-error A registered witness requires its occurrence.
  const witness: RegisteredPlaylistWitness = { descriptor: { kind: "retained-playlist-restore", deviceId: identity.deviceId, accepted }, registration: { kind: "registered" } }
  // @ts-expect-error The accepted locator is a global occurrence.
  const accountLocator: AcceptedPlaylistRecord = { ...accepted, pending: { ...accepted.pending, effect: { ...accepted.pending.effect, item: { sourceKey: "account:AAAAAAAAAAAAAAAA", path: [0] } } } }
  // @ts-expect-error A global occurrence has a numeric index.
  const stringLocator: AcceptedPlaylistRecord = { ...accepted, pending: { ...accepted.pending, effect: { ...accepted.pending.effect, item: { sourceKey: "playlists", path: ["0"] } } } }
  // @ts-expect-error A global occurrence has exactly one path component.
  const longLocator: AcceptedPlaylistRecord = { ...accepted, pending: { ...accepted.pending, effect: { ...accepted.pending.effect, item: { sourceKey: "playlists", path: [0, 1] } } } }
  // @ts-expect-error The chosen account is immutable.
  identity.operation.record.pending.effect.key.acct = effect.key.acct
  // @ts-expect-error The chosen occurrence is immutable.
  identity.operation.record.pending.effect.item.path[0] = 1
  // @ts-expect-error Raw account strings cannot replace a validated AccountKey.
  const rawAccount: PlaylistRestoreEffect = { ...accepted.pending.effect, key: { kind: "setup", acct: "AAAAAAAAAAAAAAAA" } }
  // @ts-expect-error Raw playlist strings cannot replace a validated PlaylistId.
  const rawPlaylist: FilterReplacementEffect = { ...effect, key: { ...effect.key, playlist: "PL_GLOBAL" } }
  // @ts-expect-error Host generations cannot replace numeric ledger generations.
  const generation: ConsentRetainedPlaylistJob = { identity, progress: { kind: "accepted" }, permission: { kind: "armed", generation: "host-generation", current: identity.original } }
  // @ts-expect-error Agreement timestamps remain numeric.
  const timestamp: RetainedPlaylistJobIdentity = { ...identity, original: { v: 1, at: "300" } }
  // @ts-expect-error Recovery cannot accept a new body.
  owner.recoverWithdrawnWork({ kind: "ui", windowId: 1, incognito: false }, { review: { kind: "withdrawn-work-review" }, job: { kind: "held-job-selection" }, body: {} })
  // @ts-expect-error Recovery cannot accept a new generation.
  owner.recoverWithdrawnWork({ kind: "ui", windowId: 1, incognito: false }, { review: { kind: "withdrawn-work-review" }, job: { kind: "held-job-selection" }, generation: 3 })
  const mixed: ExactRecoveryResult = {
    kind: "recovered",
    job: identity,
    // @ts-expect-error A recovered playlist must keep playlist operation correlation.
    completion: { operation: "retained-filter-replacement", result: { kind: "confirmed", identity, original: identity.original, current: identity.original, activation: "held", mutations: [] } },
    remaining: []
  }
  const failed: ExactRecoveryResult = {
    kind: "recovered",
    job: identity,
    // @ts-expect-error A recovered playlist cannot contain a failed execution.
    completion: { operation: "retained-playlist-restore", result: { kind: "failed", identity, stage: "documents", write: { kind: "rejected", error: null }, mutations: [] } },
    remaining: []
  }
  void [
    fabricated,
    filterDescriptor,
    completedDescriptor,
    uninstalled,
    syncedV3,
    syncingV3,
    retiring,
    done,
    held,
    unregistered,
    acceptedView,
    witness,
    accountLocator,
    stringLocator,
    longLocator,
    rawAccount,
    rawPlaylist,
    generation,
    timestamp,
    mixed,
    failed
  ]
}
void [playlistPositive, installedPlaylistPositive, playlistNegative]
