import type { ExactRemovalPermit, RemovalJobIdentity, ExactRecoveryResult } from "./consent-recovery"

function negative() {
  // @ts-expect-error A caller cannot construct the reference-private execution permit.
  const permit: ExactRemovalPermit = {}
  // @ts-expect-error A work kind and agreement cannot replace the exact occurrence and effect.
  const identity: RemovalJobIdentity = { deviceId: "fixture", original: { v: 1, at: 1 }, operation: { kind: "account-removal" } }
  // @ts-expect-error A failed executor result cannot be a recovery completion.
  const completion: Extract<ExactRecoveryResult, { kind: "recovered" }>["completion"] = { operation: "account-removal", result: { kind: "failed", stage: "prepare", error: null } }
  void [permit, identity, completion]
}
void negative

import {
  executeExactRetainedAgreement,
  type ExactRetainedAgreementPermit,
  type RetainedAgreementJobIdentity,
  type ConsentRetainedAgreementJob,
  type RetainedAgreementRecoveryPorts,
  type RetainedAgreementRecoveryExecution
} from "./consent-recovery"
import type { createLocalFilterWriter } from "./local-filter-writer"
type LocalFilterWriter = ReturnType<typeof createLocalFilterWriter>
import type { JsonObject } from "../../shared/contracts/json"

function retainedPositive(
  permit: ExactRetainedAgreementPermit,
  ports: RetainedAgreementRecoveryPorts,
  owner: LocalFilterWriter,
  identity: RetainedAgreementJobIdentity,
  confirmed: Extract<RetainedAgreementRecoveryExecution, { kind: "confirmed" }>,
  remaining: readonly import("./consent-recovery").HeldWorkView[]
) {
  void executeExactRetainedAgreement(permit, ports)
  const result: ExactRecoveryResult = {
    kind: "recovered",
    job: identity,
    completion: { operation: "retained-agreement", result: confirmed },
    permissionWrites: [
      { stage: "prepare", write: { kind: "resolved" } },
      { stage: "authorize", write: { kind: "resolved" } }
    ],
    remaining
  }
  void [owner, result]
}
function retainedNegative(
  removal: ExactRemovalPermit,
  retained: ExactRetainedAgreementPermit,
  identity: RetainedAgreementJobIdentity,
  record: JsonObject,
  ports: RetainedAgreementRecoveryPorts,
  owner: LocalFilterWriter,
  confirmed: Extract<RetainedAgreementRecoveryExecution, { kind: "confirmed" }>
) {
  // @ts-expect-error Public values cannot construct the retained receipt permit.
  const fabricated: ExactRetainedAgreementPermit = {}
  // @ts-expect-error Public job JSON is not a private retained permit.
  executeExactRetainedAgreement(identity, ports)
  // @ts-expect-error Removal authority cannot execute retained receipts.
  executeExactRetainedAgreement(removal, ports)
  // @ts-expect-error Retained authority cannot execute removal effects.
  const wrongRemoval: ExactRemovalPermit = retained
  // @ts-expect-error Retained identity requires a durable occurrence.
  const noOccurrence: RetainedAgreementJobIdentity = { deviceId: "fixture", operation: { kind: "retained-agreement", record }, original: { v: 1, at: 1 } }
  // @ts-expect-error Terminal progress cannot have held permission.
  const heldTerminal: ConsentRetainedAgreementJob = { identity, progress: { kind: "terminal" }, permission: { kind: "held" } }
  // @ts-expect-error Accepted progress cannot retire a receipt.
  const retiringAccepted: ConsentRetainedAgreementJob = { identity, progress: { kind: "accepted" }, permission: { kind: "retiring", generation: 1, current: { v: 1, at: 2 } } }
  // @ts-expect-error Retained completion cannot be paired with a removal identity.
  const mixed: ExactRecoveryResult = {
    kind: "recovered",
    job: { ...identity, operation: { kind: "account-removal", record } },
    completion: { operation: "retained-agreement", result: confirmed },
    permissionWrites: [
      { stage: "prepare", write: { kind: "resolved" } },
      { stage: "authorize", write: { kind: "resolved" } }
    ],
    remaining: []
  }
  // @ts-expect-error Failed retained execution cannot be a recovered completion.
  const failed: ExactRecoveryResult = {
    kind: "recovered",
    job: identity,
    completion: { operation: "retained-agreement", result: { kind: "failed", stage: "record", write: { kind: "rejected", error: null } } },
    permissionWrites: [
      { stage: "prepare", write: { kind: "resolved" } },
      { stage: "authorize", write: { kind: "resolved" } }
    ],
    remaining: []
  }
  // @ts-expect-error The retained executor has no Device setter.
  const devicePort: RetainedAgreementRecoveryPorts = { ...ports, setDevice: async (_device: JsonObject) => {} }
  // @ts-expect-error A ledger setter cannot accept a Device batch.
  ports.setLedger({ device: record })
  // @ts-expect-error A receipt setter accepts only a confirmed V2.
  ports.setConfirmed({ device: record })
  // @ts-expect-error The public resume method accepts no private execution permit.
  owner.resumeRetainedAgreement({ kind: "ui", windowId: 1, incognito: false }, retained)
  void [fabricated, wrongRemoval, noOccurrence, heldTerminal, retiringAccepted, mixed, failed, devicePort]
}
void [retainedPositive, retainedNegative]

import {
  executeExactRetainedV1Acceptance,
  type ExactRetainedV1AcceptancePermit,
  type RetainedV1Descriptor,
  type ConsentRetainedV1Proposal,
  type RetainedV1RecoveryJob,
  type RetainedV1RecoveryCompletion,
  type RetainedV1AcceptancePorts,
  type RetainedV1AcceptanceBatch
} from "./consent-recovery"

function v1Positive(
  descriptor: RetainedV1Descriptor,
  permit: ExactRetainedV1AcceptancePermit,
  ports: RetainedV1AcceptancePorts,
  receipt: Extract<RetainedAgreementRecoveryExecution, { kind: "confirmed" }>
) {
  const draft: ConsentRetainedV1Proposal = { descriptor, registration: { kind: "unregistered", expectedNext: 0 }, permission: { kind: "prepared", generation: 2, current: { v: 1, at: 300 } } }
  const registered: ConsentRetainedV1Proposal = { descriptor, registration: { kind: "registered", occurrence: 0 } }
  const job: RetainedV1RecoveryJob = {
    deviceId: descriptor.deviceId,
    occurrence: 0,
    operation: { kind: "retained-v1-acceptance", proposal: descriptor },
    original: descriptor.accepted.agreement.effect.consent
  }
  const completion: RetainedV1RecoveryCompletion = { operation: "retained-v1-acceptance", result: { kind: "confirmed", acceptance: { kind: "already-present" }, receipt, activation: "held" } }
  const result: ExactRecoveryResult = {
    kind: "recovered",
    job,
    completion,
    permissionWrites: [
      { stage: "prepare", write: { kind: "resolved" } },
      { stage: "authorize", write: { kind: "resolved" } }
    ],
    remaining: []
  }
  void executeExactRetainedV1Acceptance(permit, ports)
  void [draft, registered, result]
}
function v1Negative(
  descriptor: RetainedV1Descriptor,
  v1: ExactRetainedV1AcceptancePermit,
  receipt: ExactRetainedAgreementPermit,
  removal: ExactRemovalPermit,
  ports: RetainedV1AcceptancePorts,
  receiptPorts: RetainedAgreementRecoveryPorts,
  job: RetainedV1RecoveryJob,
  confirmed: Extract<RetainedAgreementRecoveryExecution, { kind: "confirmed" }>,
  owner: LocalFilterWriter,
  draft: Extract<ConsentRetainedV1Proposal, { permission: unknown }>
) {
  // @ts-expect-error A descriptor cannot construct the owner-private V1 permit.
  const publicPermit: ExactRetainedV1AcceptancePermit = descriptor
  // @ts-expect-error JSON permission cannot execute acceptance.
  executeExactRetainedV1Acceptance(draft.permission, ports)
  // @ts-expect-error Receipt permits cannot execute V1 acceptance.
  executeExactRetainedV1Acceptance(receipt, ports)
  // @ts-expect-error Removal permits cannot execute V1 acceptance.
  executeExactRetainedV1Acceptance(removal, ports)
  // @ts-expect-error V1 permits cannot execute receipts.
  executeExactRetainedAgreement(v1, receiptPorts)
  // @ts-expect-error V1 permits cannot execute removals.
  const wrongRemoval: ExactRemovalPermit = v1
  // @ts-expect-error Draft permission has no receipt identity or accepted progress.
  const acceptedJob: ConsentRetainedAgreementJob = draft
  // @ts-expect-error Unregistered proposals have a counter pin, not an allocated occurrence.
  const occurrence: number = draft.registration.occurrence
  // @ts-expect-error An unregistered proposal cannot be a recovered job.
  const allocated: RetainedV1RecoveryJob = draft
  // @ts-expect-error A V1 job cannot carry a receipt-only completion.
  const mixed: ExactRecoveryResult = {
    kind: "recovered",
    job,
    completion: { operation: "retained-agreement", result: confirmed },
    permissionWrites: [
      { stage: "prepare", write: { kind: "resolved" } },
      { stage: "authorize", write: { kind: "resolved" } }
    ],
    remaining: []
  }
  // @ts-expect-error The V1 acceptance port has no Device setter.
  const devicePort: RetainedV1AcceptancePorts = { ...ports, setDevice: async (_device: JsonObject) => {} }
  // @ts-expect-error Acceptance requires both fixed V2 and the registered ledger.
  ports.setAccepted({ interimConversion: descriptor.accepted })
  // @ts-expect-error A V1 record is not an accepted V2 batch.
  const v1Batch: RetainedV1AcceptanceBatch = { interimConversion: descriptor.retained, "consent:jobs": { v: 1, kind: "consent-jobs", deviceId: descriptor.deviceId, next: 0, jobs: [] } }
  // @ts-expect-error Failed receipt execution cannot inhabit a V1 confirmed completion.
  const failed: RetainedV1RecoveryCompletion = {
    operation: "retained-v1-acceptance",
    result: { kind: "confirmed", acceptance: { kind: "already-present" }, receipt: { kind: "failed", stage: "record", write: { kind: "rejected", error: null } }, activation: "held" }
  }
  // @ts-expect-error The public resume method accepts no V1 permit.
  owner.resumeRetainedAgreement({ kind: "ui", windowId: 1, incognito: false }, v1)
  void [publicPermit, wrongRemoval, acceptedJob, occurrence, allocated, mixed, devicePort, v1Batch, failed]
}
void [v1Positive, v1Negative]

import {
  executeExactRetainedInstallation,
  type ExactRetainedInstallationPermit,
  type RetainedInstallationPorts,
  type RetainedInstallationJobIdentity,
  type ConsentRetainedInstallationJob,
  type RetainedInstallationExecution
} from "./consent-recovery"
import type { ConfirmedRetainedAgreementV2, InstalledRetainedInstallationV3, InterimInstallationReview } from "./interim-installation"
function installationPositive(
  permit: ExactRetainedInstallationPermit,
  ports: RetainedInstallationPorts,
  identity: RetainedInstallationJobIdentity,
  execution: Extract<RetainedInstallationExecution, { kind: "confirmed" }>
) {
  void executeExactRetainedInstallation(permit, ports)
  const result: ExactRecoveryResult = {
    kind: "recovered",
    job: identity,
    completion: { operation: "retained-installation", result: execution },
    permissionWrites: [
      { stage: "prepare", write: { kind: "resolved" } },
      { stage: "authorize", write: { kind: "resolved" } }
    ],
    remaining: []
  }
  const terminal: ConsentRetainedInstallationJob = { identity, progress: { kind: "terminal" }, permission: { kind: "prepared", generation: 2, current: { v: 1, at: 300 } } }
  void [result, terminal]
}
function installationNegative(
  permit: ExactRetainedInstallationPermit,
  receipt: ExactRetainedAgreementPermit,
  v1: ExactRetainedV1AcceptancePermit,
  removal: ExactRemovalPermit,
  review: InterimInstallationReview,
  ports: RetainedInstallationPorts,
  terminal: Pick<RetainedInstallationPorts, "setLedger" | "setInstalled">,
  identity: RetainedInstallationJobIdentity,
  v2: ConfirmedRetainedAgreementV2,
  installed: InstalledRetainedInstallationV3,
  execution: Extract<RetainedInstallationExecution, { kind: "confirmed" }>
) {
  // @ts-expect-error Installation permits have a module-private brand.
  const fabricated: ExactRetainedInstallationPermit = {}
  // @ts-expect-error Receipt authority cannot execute installation.
  executeExactRetainedInstallation(receipt, ports)
  // @ts-expect-error V1 acceptance authority cannot execute installation.
  executeExactRetainedInstallation(v1, ports)
  // @ts-expect-error Removal authority cannot execute installation.
  executeExactRetainedInstallation(removal, ports)
  // @ts-expect-error Ordinary review authority cannot execute recovery installation.
  executeExactRetainedInstallation(review, ports)
  // @ts-expect-error An installed receipt is data, not a permit.
  executeExactRetainedInstallation(installed, ports)
  // @ts-expect-error Public JSON identity cannot execute installation.
  executeExactRetainedInstallation(identity, ports)
  // @ts-expect-error Installation authority cannot execute retained receipts.
  executeExactRetainedAgreement(permit, { setLedger: ports.setLedger, setConfirmed: async () => {} })
  // @ts-expect-error Terminal authority has no documents callback.
  terminal.setDocuments(identity.operation.effect)
  // @ts-expect-error Confirmed V2 has not accepted installation.
  const wrongRecord: RetainedInstallationJobIdentity = { ...identity, operation: { ...identity.operation, record: v2 } }
  // @ts-expect-error Accepted installation cannot retire before its terminal progress.
  const retiring: ConsentRetainedInstallationJob = { identity, progress: { kind: "accepted" }, permission: { kind: "retiring", generation: 2, current: { v: 1, at: 300 } } }
  // @ts-expect-error Terminal progress cannot be held.
  const held: ConsentRetainedInstallationJob = { identity, progress: { kind: "terminal" }, permission: { kind: "held" } }
  // @ts-expect-error Accepted progress cannot be done.
  const done: ConsentRetainedInstallationJob = { identity, progress: { kind: "accepted" }, permission: { kind: "done" } }
  // @ts-expect-error Installation completion cannot pair with a receipt identity.
  const mixed: ExactRecoveryResult = {
    kind: "recovered",
    job: { ...identity, operation: { kind: "retained-agreement", record: {} } },
    completion: { operation: "retained-installation", result: execution },
    permissionWrites: [
      { stage: "prepare", write: { kind: "resolved" } },
      { stage: "authorize", write: { kind: "resolved" } }
    ],
    remaining: []
  }
  // @ts-expect-error A failed installation cannot claim completion.
  const failed: ExactRecoveryResult = {
    kind: "recovered",
    job: identity,
    completion: { operation: "retained-installation", result: { kind: "failed", stage: "record", write: { kind: "rejected", error: null }, mutations: [] } },
    permissionWrites: [
      { stage: "prepare", write: { kind: "resolved" } },
      { stage: "authorize", write: { kind: "resolved" } }
    ],
    remaining: []
  }
  // @ts-expect-error Installation remains held on success.
  const active: RetainedInstallationExecution = { ...execution, activation: "ok" }
  // @ts-expect-error Installation ports have no Device setter.
  ports.setDevice({})
  // @ts-expect-error Installed receipt setter cannot accept a V2 agreement.
  ports.setInstalled(v2)
  void [fabricated, wrongRecord, retiring, held, done, mixed, failed, active]
}
void [installationPositive, installationNegative]

import {
  executeExactRetainedInstallationAcceptance,
  type ExactRetainedInstallationAcceptancePermit,
  type RetainedInstallationAcceptancePorts,
  type RetainedInstallationAcceptanceBatch,
  type RetainedInstallationDescriptor,
  type ConsentRetainedInstallationProposal,
  type RetainedInstallationAcceptanceJob
} from "./consent-recovery"
function installationAcceptancePositive(
  descriptor: RetainedInstallationDescriptor,
  permit: ExactRetainedInstallationAcceptancePermit,
  ports: RetainedInstallationAcceptancePorts,
  installation: Extract<RetainedInstallationExecution, { kind: "confirmed" }>
) {
  const draft: ConsentRetainedInstallationProposal = {
    descriptor,
    registration: { kind: "unregistered", expectedNext: 0 },
    permission: { kind: "prepared", generation: 2, current: { v: 1, at: 300 } }
  }
  const job: RetainedInstallationAcceptanceJob = {
    deviceId: descriptor.deviceId,
    occurrence: 0,
    operation: { kind: "retained-installation-acceptance", descriptor },
    original: descriptor.accepted.agreed.agreement.effect.consent
  }
  const result: ExactRecoveryResult = {
    kind: "recovered",
    job,
    completion: { operation: "retained-installation-acceptance", result: { kind: "confirmed", acceptance: { kind: "already-present" }, installation, activation: "held" } },
    permissionWrites: [
      { stage: "prepare", write: { kind: "resolved" } },
      { stage: "authorize", write: { kind: "resolved" } }
    ],
    remaining: []
  }
  void executeExactRetainedInstallationAcceptance(permit, ports)
  void [draft, result]
}
function installationAcceptanceNegative(
  permit: ExactRetainedInstallationAcceptancePermit,
  installed: ExactRetainedInstallationPermit,
  receipt: ExactRetainedAgreementPermit,
  v1: ExactRetainedV1AcceptancePermit,
  removal: ExactRemovalPermit,
  review: InterimInstallationReview,
  descriptor: RetainedInstallationDescriptor,
  ports: RetainedInstallationAcceptancePorts,
  installationPorts: RetainedInstallationPorts,
  draft: Extract<ConsentRetainedInstallationProposal, { permission: unknown }>,
  job: RetainedInstallationAcceptanceJob,
  installation: RetainedInstallationExecution,
  v2: ConfirmedRetainedAgreementV2
) {
  // @ts-expect-error Public descriptors cannot construct acceptance authority.
  const fabricated: ExactRetainedInstallationAcceptancePermit = descriptor
  // @ts-expect-error Persisted permission is not live acceptance authority.
  executeExactRetainedInstallationAcceptance(draft.permission, ports)
  // @ts-expect-error Installation execution cannot accept a new V3.
  executeExactRetainedInstallationAcceptance(installed, ports)
  // @ts-expect-error Receipt authority cannot accept installation.
  executeExactRetainedInstallationAcceptance(receipt, ports)
  // @ts-expect-error V1 acceptance cannot accept installation.
  executeExactRetainedInstallationAcceptance(v1, ports)
  // @ts-expect-error Removal authority cannot accept installation.
  executeExactRetainedInstallationAcceptance(removal, ports)
  // @ts-expect-error Ordinary installation review cannot accept recovery installation.
  executeExactRetainedInstallationAcceptance(review, ports)
  // @ts-expect-error Acceptance authority cannot execute documents.
  executeExactRetainedInstallation(permit, installationPorts)
  // @ts-expect-error Drafts contain no allocated occurrence.
  const occurrence: number = draft.registration.occurrence
  // @ts-expect-error Drafts are not accepted installation jobs.
  const accepted: ConsentRetainedInstallationJob = draft
  // @ts-expect-error The acceptance setter requires both keys.
  ports.setAccepted({ interimConversion: descriptor.accepted })
  // @ts-expect-error Confirmed V2 cannot substitute for accepted V3.
  const batch: RetainedInstallationAcceptanceBatch = { interimConversion: v2, "consent:jobs": { v: 1, kind: "consent-jobs", deviceId: descriptor.deviceId, next: 0, jobs: [] } }
  // @ts-expect-error Partial executor results cannot be successful acceptance completions.
  const partial: Extract<ExactRecoveryResult, { kind: "recovered"; job: RetainedInstallationAcceptanceJob }> = {
    kind: "recovered",
    job,
    completion: { operation: "retained-installation-acceptance", result: { kind: "confirmed", acceptance: { kind: "already-present" }, installation, activation: "held" } },
    permissionWrites: [
      { stage: "prepare", write: { kind: "resolved" } },
      { stage: "authorize", write: { kind: "resolved" } }
    ],
    remaining: []
  }
  // @ts-expect-error Acceptance cannot publish an installation-only completion with its different job.
  const mixed: ExactRecoveryResult = {
    kind: "recovered",
    job,
    completion: { operation: "retained-installation", result: { kind: "confirmed", original: job.original, current: job.original, activation: "held", mutations: [] } },
    permissionWrites: [
      { stage: "prepare", write: { kind: "resolved" } },
      { stage: "authorize", write: { kind: "resolved" } }
    ],
    remaining: []
  }
  // @ts-expect-error The acceptance port has no Device setter.
  const device: RetainedInstallationAcceptancePorts = { ...ports, setDevice: async () => {} }
  void [fabricated, occurrence, accepted, batch, partial, mixed, device]
}
void [installationAcceptancePositive, installationAcceptanceNegative]
