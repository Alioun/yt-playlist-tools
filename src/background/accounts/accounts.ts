import { isAccountKey, type AccountKey, type AccountLabel } from "../../shared/model"
import type { I18n } from "../../shared/i18n"
import { checkedAccountLabel, type AccountLabelsOwner, type AccountLabelSeen, type AccountLabelWrite, type LabelJob } from "../store/account-label"
import type { ClaimTransactionResult } from "../store/local-claim-writer"
import type { PlaylistCacheOwner, PlaylistCacheCapture, PlaylistCacheRead } from "../store/playlist-cache"
import type { TabContext, Tabs, TabJobOutcome } from "../tabs/ports"

export type Claiming = { readonly kind: "unavailable"; readonly reason: "production-ownership-required" } | { readonly kind: "connected"; onSeen(context: TabContext): Promise<ClaimTransactionResult> }
export type SeenClaim =
  | Extract<Claiming, { kind: "unavailable" }>
  | { readonly kind: "not-eligible"; readonly reason: "signed-out" | "private" | "held" | "disposed" }
  | { readonly kind: "owner"; readonly result: ClaimTransactionResult }
  | { readonly kind: "failed" }
export type SeenLabel =
  | { readonly kind: "signed-out" | "private" | "disposed" | "invalid-context" }
  | { readonly kind: "no-setup" }
  | { readonly kind: "stored"; readonly acct: AccountKey; readonly label: AccountLabel | null; readonly checkedAt: number; readonly lastAccount: "committed" | "unchanged" }
  | { readonly kind: "lookup-failed"; readonly acct: AccountKey; readonly checkedAt: number; readonly outcome: TabJobOutcome<LabelJob> | { readonly kind: "invalid-label" | "exception" } }
  | { readonly kind: "completed"; readonly acct: AccountKey; readonly result: AccountLabelWrite }
  | { readonly kind: "owner"; readonly result: Exclude<AccountLabelSeen, { kind: "no-setup" | "current" | "lookup" }> }
export type SeenAccount = { readonly label: SeenLabel; readonly claim: SeenClaim }
export type LiveLabel =
  | { readonly kind: "label"; readonly acct: AccountKey; readonly label: AccountLabel; readonly persistence: "caller-owned" }
  | { readonly kind: "signed-out" | "disposed" | "invalid-context" | "setup-present" }
  | { readonly kind: "owner"; readonly result: Exclude<PlaylistCacheRead, { kind: "cache" }> }
  | { readonly kind: "lookup-failed"; readonly outcome: TabJobOutcome<LabelJob> | { readonly kind: "invalid-label" | "exception" } }
export type Accounts = {
  onSeen(context: TabContext): Promise<SeenAccount>
  readLiveLabel(context: TabContext): Promise<LiveLabel>
  dispose(): void
}
type Lookup = { readonly capture: PlaylistCacheCapture; readonly work: Promise<SeenLabel> }

export function accountDisplayName(label: AccountLabel | null, i18n: Pick<I18n, "message">): string {
  return label?.name.trim() ? label.name : i18n.message("copy_account")
}

function contextValid(context: TabContext): boolean {
  return (
    context.tab.site === context.info.site &&
    (context.tab.site === "www" || context.tab.site === "music") &&
    Number.isSafeInteger(context.tab.tabId) &&
    context.tab.tabId >= 0 &&
    Number.isSafeInteger(context.tab.windowId) &&
    context.tab.windowId >= 0 &&
    typeof context.tab.incognito === "boolean" &&
    (context.info.signedIn ? isAccountKey(context.info.acct) : context.info.acct === null)
  )
}
function copyContext(context: TabContext): TabContext {
  return { tab: { ...context.tab }, info: { ...context.info } }
}

export function createAccounts(ports: {
  readonly owner: AccountLabelsOwner & Pick<PlaylistCacheOwner, "readPlaylistCache">
  readonly tabs: Pick<Tabs, "runIn">
  readonly claim: Claiming
  readonly now: () => number
}): Accounts {
  let disposed = false
  const lookups = new Map<AccountKey, Lookup>()
  async function run(context: TabContext, acct: AccountKey): Promise<TabJobOutcome<LabelJob>> {
    return ports.tabs.runIn<LabelJob>(
      context.tab.tabId,
      { job: { kind: "accountLabel" }, acct },
      {
        site: context.tab.site,
        req: { windowId: context.tab.windowId, activeTabId: context.tab.tabId, incognito: context.tab.incognito },
        account: { kind: "account", acct, signedIn: true }
      }
    )
  }
  async function lookup(context: TabContext, acct: AccountKey, read: Extract<AccountLabelSeen, { kind: "lookup" }>): Promise<SeenLabel> {
    let outcome
    try {
      outcome = await run(context, acct)
    } catch {
      return { kind: "lookup-failed", acct, checkedAt: read.checkedAt, outcome: { kind: "exception" } }
    }
    if (disposed) return { kind: "disposed" }
    if (outcome.kind !== "result" || !outcome.result.ok) return { kind: "lookup-failed", acct, checkedAt: read.checkedAt, outcome }
    const label = checkedAccountLabel(outcome.result.data)
    if (!label) return { kind: "lookup-failed", acct, checkedAt: read.checkedAt, outcome: { kind: "invalid-label" } }
    return { kind: "completed", acct, result: await ports.owner.completeAccountLabel(read.capture, { acct, label }) }
  }
  async function seenLabel(context: TabContext, acct: AccountKey): Promise<SeenLabel> {
    const read = await ports.owner.seeAccountLabel({ acct, private: false, at: ports.now() })
    if (disposed) return { kind: "disposed" }
    if (read.kind === "no-setup") return read
    if (read.kind !== "lookup" && read.kind !== "current") return { kind: "owner", result: read }
    const active = lookups.get(acct)
    if (active && active.capture.sharesAuthority(read.capture)) return active.work
    if (read.kind === "current") return { kind: "stored", acct, label: read.label, checkedAt: read.checkedAt, lastAccount: read.lastAccount }
    const work = lookup(context, acct, read),
      slot = { capture: read.capture, work }
    lookups.set(acct, slot)
    try {
      return await work
    } finally {
      if (lookups.get(acct) === slot) lookups.delete(acct)
    }
  }
  return {
    async onSeen(supplied) {
      if (disposed) return { label: { kind: "disposed" }, claim: { kind: "not-eligible", reason: "disposed" } }
      const context = copyContext(supplied)
      if (!contextValid(context)) return { label: { kind: "invalid-context" }, claim: { kind: "not-eligible", reason: "held" } }
      if (!context.info.signedIn) return { label: { kind: "signed-out" }, claim: { kind: "not-eligible", reason: "signed-out" } }
      if (context.tab.incognito) return { label: { kind: "private" }, claim: { kind: "not-eligible", reason: "private" } }
      const label = await seenLabel(context, context.info.acct)
      if (disposed) return { label, claim: { kind: "not-eligible", reason: "disposed" } }
      if (label.kind !== "stored" && label.kind !== "no-setup" && !(label.kind === "completed" && (label.result.kind === "committed" || label.result.kind === "current")))
        return { label, claim: { kind: "not-eligible", reason: "held" } }
      if (ports.claim.kind === "unavailable") return { label, claim: ports.claim }
      try {
        return { label, claim: { kind: "owner", result: await ports.claim.onSeen(context) } }
      } catch {
        return { label, claim: { kind: "failed" } }
      }
    },
    async readLiveLabel(supplied) {
      if (disposed) return { kind: "disposed" }
      const context = copyContext(supplied)
      if (!contextValid(context)) return { kind: "invalid-context" }
      if (!context.info.signedIn) return { kind: "signed-out" }
      const acct = context.info.acct
      const read = await ports.owner.readPlaylistCache({ acct, private: context.tab.incognito })
      if (disposed) return { kind: "disposed" }
      if (read.kind !== "cache") return { kind: "owner", result: read }
      if (read.authority.kind === "eligible") return { kind: "setup-present" }
      let outcome
      try {
        outcome = await run(context, acct)
      } catch {
        return { kind: "lookup-failed", outcome: { kind: "exception" } }
      }
      if (disposed) return { kind: "disposed" }
      if (outcome.kind !== "result" || !outcome.result.ok) return { kind: "lookup-failed", outcome }
      const label = checkedAccountLabel(outcome.result.data)
      return label ? { kind: "label", acct, label, persistence: "caller-owned" } : { kind: "lookup-failed", outcome: { kind: "invalid-label" } }
    },
    dispose() {
      disposed = true
      lookups.clear()
    }
  }
}
