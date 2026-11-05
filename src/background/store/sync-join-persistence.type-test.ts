import type { JoinMaterialization, JoinAgreementFacts, SyncJoinCheckpointV1, SyncJoinCheckpointV2, ReconcileEffect } from "./sync-join-persistence"
function negative(effect: JoinMaterialization) {
  // @ts-expect-error A choice cannot recursively contain another choice.
  const recursive: SyncJoinCheckpointV1 = { v: 1, kind: "sync-join", phase: "choice", lastJoined: null, observedMetadata: {}, suspended: { kind: "choice" } }
  // @ts-expect-error Outbound debt cannot retain materialization before-documents.
  const debt: SyncJoinCheckpointV1 = { v: 1, kind: "sync-join", phase: "outbound", debt: effect.debt, effect }
  // @ts-expect-error Off markers carry no outbound authority.
  const off: SyncJoinCheckpointV1 = { v: 1, kind: "sync-join", phase: "off", unfinishedTarget: "H", debt: effect.debt }
  // @ts-expect-error Consent observations are fixed values, never promises.
  const facts: JoinAgreementFacts = { kind: "first-run", selected: [], access: Promise.resolve({ www: true, music: true, browserMenu: true }) }
  void recursive
  void debt
  void off
  void facts
}
void negative

function v2Negative(effect: ReconcileEffect) {
  const accepted: SyncJoinCheckpointV2 = { v: 2, kind: "sync-join", phase: "accepted", effect }
  // @ts-expect-error A v1 checkpoint cannot grant reconciliation authority.
  const legacy: SyncJoinCheckpointV1 = { v: 1, kind: "sync-join", phase: "accepted", effect }
  // @ts-expect-error Flat debt contains no predecessor effect.
  const chain: ReconcileEffect["basis"]["priorDebt"] = { ...effect.debt, effect }
  // @ts-expect-error Reconciliation has no agreement, access or side action.
  const agreement: ReconcileEffect = { ...effect, agreement: { kind: "none" } }
  // @ts-expect-error An off marker retains no document bodies.
  const off: SyncJoinCheckpointV2 = { v: 2, kind: "sync-join", phase: "off", unfinishedTarget: "H", effect }
  void accepted
  void legacy
  void chain
  void agreement
  void off
}
void v2Negative
