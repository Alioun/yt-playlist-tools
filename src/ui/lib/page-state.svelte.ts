import type { FeatureSettingAnswer } from "../../shared/contracts/shared-settings"
import type { UiAccountInView } from "../../shared/contracts/ui-playlists"
import type { UiStatus } from "../../shared/contracts/ui-pages"
import type { PageSetup, PageView } from "../../shared/model/page-view"
import type { Settings } from "../../shared/model/types"
import type { Snapshot } from "../../shared/model/settings-view"
import type { AccountKey, PlaylistId } from "../../shared/model/validation"
import { cacheRows, WATCH_LATER } from "../../shared/model/account-cache"
import type { PageFeatureId } from "../onboarding/features"
import type { ExtensionPage } from "../shell/start"
import { accountKeyOf } from "./notices"
import type { SiteAccess } from "./held"

type View = Extract<PageView, { kind: "view" }>

/**
 * What the popup and settings draw from: the stored view, the live status, the account in view and site access.
 * Before consent nothing is asked of YouTube's tabs, so the account and status stay unread (UI-POP-26, UI-RULE-24).
 */
export class PageState {
  view = $state.raw<PageView | null>(null)
  status = $state.raw<UiStatus | null>(null)
  account = $state.raw<UiAccountInView | null>(null)
  access = $state.raw<SiteAccess | null>(null)
  /** The setup the header's "Show the setup for" picked, else the account in view's (UI-POP-07). */
  chosen = $state<AccountKey | null>(null)
  readonly page: ExtensionPage
  readonly #stops: (() => void)[] = []
  #accountRead = false

  constructor(page: ExtensionPage) {
    this.page = page
    void page.backend.loadPage().then(view => {
      this.#seen(view)
    })
    this.#stops.push(
      page.backend.watchPage(event => {
        this.#seen(event.view)
      })
    )
    void this.refreshAccess()
  }
  #seen(view: PageView) {
    this.view = view
    if (view.kind === "view" && view.settings.kind === "value") this.page.applyTheme(view.settings.settings.theme)
    if (this.agreed && !this.#accountRead) {
      this.#accountRead = true
      void this.refreshAccount()
      void this.refreshStatus()
    }
  }
  get ready(): View | null {
    return this.view?.kind === "view" ? this.view : null
  }
  get settings(): Snapshot<Settings> | null {
    const view = this.ready
    return view?.settings.kind === "value" ? view.settings.settings : null
  }
  get agreed(): boolean {
    const view = this.ready
    return view?.device.kind === "current" && view.device.device.consent !== null && view.device.device.upgradeNote?.state !== "pending"
  }
  get editable(): boolean {
    const view = this.ready
    return view !== null && view.layout === "current" && view.settings.kind === "value"
  }
  get paused(): boolean {
    return this.status?.kind === "status" && this.status.paused
  }
  get tabAccount(): AccountKey | null {
    return accountKeyOf(this.account)
  }
  get acct(): AccountKey | null {
    return this.chosen ?? this.tabAccount
  }
  get setup(): PageSetup | undefined {
    const acct = this.acct
    return acct ? this.ready?.setups.find(entry => entry.acct === acct) : undefined
  }
  get private(): boolean {
    return this.page.private
  }
  get signedIn(): boolean {
    return this.account?.kind === "account" && (this.account.source === "last-account" || this.account.signedIn)
  }
  /** A tab serves the account in view, so lists refresh and playlists can be created (FT-54). */
  get tab(): boolean {
    return this.account?.kind === "account" && this.account.source !== "last-account" && this.chosen === null
  }
  accountName(acct: AccountKey | null = this.acct): string {
    const setup = acct ? this.ready?.setups.find(entry => entry.acct === acct) : undefined
    return setup?.setup.label?.name || this.page.i18n.message("copy_account")
  }
  /** A playlist's title from the account's cache, for summaries and choosers. */
  title(id: PlaylistId | null, acct: AccountKey | null = this.acct): string | null {
    if (id === null) return null
    if (id === WATCH_LATER) return this.page.i18n.message("picker_watchLater")
    const cache = acct ? this.ready?.setups.find(entry => entry.acct === acct)?.cache : undefined
    return cache ? ([...cacheRows(cache, "www"), ...cacheRows(cache, "music")].find(row => row.id === id)?.title ?? null) : null
  }
  async refreshAccess() {
    const access = this.page.backend.access
    const [www, music, browserMenu] = await Promise.all([access.has("www"), access.has("music"), access.hasBrowserMenu()])
    this.access = { www, music, browserMenu }
  }
  async refreshAccount() {
    const answer = await this.page.backend.call("ui.accountInView", {})
    this.account = answer.kind === "answered" ? answer.result : { kind: "unavailable", reason: "native" }
  }
  async refreshStatus() {
    const answer = await this.page.backend.call("ui.status", {})
    this.status = answer.kind === "answered" ? answer.result : { kind: "unavailable", reason: "collaborator" }
  }
  /** One feature switch, with any permission asked in the click (UI-POP-21, FT-52). */
  async switchFeature(feature: PageFeatureId, value: boolean): Promise<FeatureSettingAnswer> {
    const settings = this.settings
    if (!settings) return { kind: "refused", reason: "unavailable" }
    const answer = await this.page.backend.changeFeatureSetting({ kind: "feature", feature, value } as never, settings)
    await this.refreshAccess()
    void this.refreshStatus()
    return answer
  }
  dispose() {
    for (const stop of this.#stops.splice(0)) stop()
  }
}
