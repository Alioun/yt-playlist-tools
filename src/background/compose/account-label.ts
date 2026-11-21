import type { UiAccountLabel } from "../../shared/contracts/ui-playlists"
import type { BuildId } from "../../shared/contracts/vocabulary"
import type { AccountKey, AccountLabel } from "../../shared/model"
import type { Accounts } from "../accounts/accounts"
import type { Requester, TabLookup, Tabs } from "../tabs/ports"

const DAY_MS = 86_400_000

/**
 * The header's name for the account in view when it has no setup to hold a label (ACC-17). Nothing about such an
 * account is stored (ACC-08, DATA-19), so a normal window's answer is kept only in this worker's memory, for a day
 * like ACC-18's label check. A private window's answer is never kept.
 */
export function composeAccountLabel(deps: {
  readonly tabs: Pick<Tabs, "accountInView">
  tab(tabId: number): Promise<TabLookup>
  readonly accounts: Pick<Accounts, "readLiveLabel">
  readonly build: BuildId
  now(): number
}): (requester: Requester) => Promise<UiAccountLabel> {
  const kept = new Map<AccountKey, { readonly label: AccountLabel; readonly at: number }>()
  return async requester => {
    const view = await deps.tabs.accountInView(requester)
    if (view.kind !== "account" || view.source === "last-account" || !view.signedIn) return { kind: "none" }
    const acct = view.acct
    const memo = requester.incognito ? undefined : kept.get(acct)
    if (memo && deps.now() - memo.at < DAY_MS) return { kind: "label", acct, label: memo.label }
    const lookup = await deps.tab(view.tabId)
    if (lookup.kind !== "tab" || lookup.tab.site === null) return { kind: "none" }
    const site = lookup.tab.site
    const read = await deps.accounts.readLiveLabel({ tab: { ...lookup.tab, site }, info: { site, build: deps.build, signedIn: true, acct } })
    if (read.kind !== "label" || read.acct !== acct) return { kind: "none" }
    if (!requester.incognito) kept.set(acct, { label: read.label, at: deps.now() })
    return { kind: "label", acct, label: read.label }
  }
}
