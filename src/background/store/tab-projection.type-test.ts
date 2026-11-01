import type { createLocalFilterWriter } from "./local-filter-writer"
import type { TabStorageProjection, TabProjectionRequest } from "./tab-projection"
import type { AccountKey } from "../../shared/model"
import type { SessionRevision } from "./session-memory"

function projectionBoundaries(owner: ReturnType<typeof createLocalFilterWriter>, acct: AccountKey,
  view: TabStorageProjection, revision: SessionRevision) {
  void owner.readTabProjection({ private: false, account: { kind: "signed-in", acct } })
  void owner.readTabProjection({ private: true, account: { kind: "unknown" } })
  void owner.readLastAccount({ kind: "normal-window", windowId: 1, incognito: false })
  // @ts-expect-error A raw account string supplies no validated account identity.
  void owner.readTabProjection({ private: false, account: { kind: "signed-in", acct: "AAAAAAAAAAAAAAAA" } })
  // @ts-expect-error Signed-out requests cannot carry an account.
  void owner.readTabProjection({ private: false, account: { kind: "signed-out", acct } })
  // @ts-expect-error Unknown account requests cannot carry a fallback account.
  void owner.readTabProjection({ private: false, account: { kind: "unknown", acct } })
  // @ts-expect-error Private facts are never a persistence request in this read contract.
  void owner.readTabProjection({ private: true, account: { kind: "signed-in", acct }, persistPrivateSkips: [] })
  // @ts-expect-error Canonical normal-session tab rows cannot persist private facts.
  void owner.changeSession({ revision, now: 1, edits: [{ kind: "tab-seen", tabId: 1, info: { site: "www", signedIn: true, acct, private: true } }] })
  // @ts-expect-error A private requester cannot obtain a last-account routing hint.
  void owner.readLastAccount({ kind: "normal-window", windowId: 1, incognito: true })
  // @ts-expect-error The projection returns no whole session or revision authority.
  void view.revision
  // @ts-expect-error Routing hints are separate from the tab projection.
  void view.lastAccount
  // @ts-expect-error The scope requires explicit sign-in knowledge.
  const missingAccount: TabProjectionRequest = { private: false }
  void missingAccount
}
void projectionBoundaries
