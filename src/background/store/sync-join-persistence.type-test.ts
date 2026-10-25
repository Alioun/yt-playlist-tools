import type { JoinMaterialization, JoinAgreementFacts, SyncJoinCheckpointV1 } from "./sync-join-persistence"
function negative(effect: JoinMaterialization) {
  // @ts-expect-error A choice cannot recursively contain another choice.
  const recursive: SyncJoinCheckpointV1 = { v: 1, kind: "sync-join", phase: "choice", lastJoined: null, observedMetadata: {}, suspended: { kind: "choice" } }
  // @ts-expect-error Outbound debt cannot retain materialization before-documents.
  const debt: SyncJoinCheckpointV1 = { v: 1, kind: "sync-join", phase: "outbound", debt: effect.debt, effect }
  // @ts-expect-error Off markers carry no outbound authority.
  const off: SyncJoinCheckpointV1 = { v: 1, kind: "sync-join", phase: "off", unfinishedTarget: "H", debt: effect.debt }
  // @ts-expect-error Consent observations are fixed values, never promises.
  const facts: JoinAgreementFacts = { kind: "first-run", selected: [], access: Promise.resolve({ www: true, music: true, browserMenu: true }) }
  void recursive; void debt; void off; void facts
}
void negative
