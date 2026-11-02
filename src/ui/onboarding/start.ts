import { mount, unmount } from "svelte"
import type { SetupDestination } from "../../shared/contracts/first-run"
import type { PickerPurpose } from "../picker"
import { createFirstRunOwner, type FirstRunServices, type ServingAccount } from "../backend/first-run-owner"
import { PageState } from "../lib/page-state.svelte"
import type { ExtensionPage } from "../shell/start"
import type { HostRequest } from "./picker-host"
import { createFirstRunText } from "./text"

/**
 * The first-run page over the real backend (B39): the account in view with its stored name, playlist titles from
 * the account's cache, and the extension pages' picker for step 3's destinations and auto-add's list.
 */
export function startFirstRun(page: ExtensionPage) {
  const pageState = new PageState(page)
  // The picker is step 3's lazy part, so first run's first view carries none of it (UI-ONB-05).
  async function host(request: HostRequest): Promise<boolean> {
    const { default: PickerHost } = await import("./PickerHost.svelte")
    return new Promise(resolve => {
      const view = mount(PickerHost, { target: document.body, props: { pageState, request, onclose(saved: boolean) { void unmount(view); resolve(saved) } } })
    })
  }
  async function account(): Promise<ServingAccount> {
    if (!await page.backend.access.has("www")) return { kind: "no-access" }
    await pageState.refreshAccount()
    const answer = pageState.account
    if (answer?.kind !== "account" || answer.source === "last-account") return { kind: "no-tab" }
    if (!answer.signedIn) return { kind: "signed-out" }
    const label = (await page.backend.loadPage()).kind === "view" ? pageState.ready?.setups.find(entry => entry.acct === answer.acct)?.setup.label : null
    return { kind: "account", key: answer.acct, account: { name: label?.name || page.i18n.message("copy_account"), ...label?.handle ? { handle: label.handle } : {} } }
  }
  const purposes: Record<"quick-save" | "music-quick-save" | "shortcut", PickerPurpose> = {
    "quick-save": { kind: "quickSave" }, "music-quick-save": { kind: "named", title: page.i18n.message("music_saveName"), subtitle: page.i18n.message("music_saveSubtitle") },
    shortcut: { kind: "named", title: page.i18n.message("picker_shortcutTitle"), subtitle: null }
  }
  const services: FirstRunServices = {
    account: { read: account },
    playlists: { async title(acct, playlist) {
      const cached = pageState.title(playlist, acct)
      if (cached) return cached
      const list = page.backend.playlistList({ acct, site: "www" })
      try { return (await list.cachedList())?.rows.find(row => row.id === playlist)?.title ?? page.i18n.message("picker_titleUnavailable") } finally { list.dispose() }
    } },
    chooser: {
      async choose({ account, request, settings }) {
        if (request.purpose === "auto-add") return { kind: "unavailable" }
        const shortcut = settings.shortcuts[0]
        const destination: SetupDestination | undefined = request.purpose === "quick-save" ? { kind: "quick-save" } : request.purpose === "music-quick-save" ? { kind: "music-save" }
          : shortcut ? { kind: "shortcut", shortcut: shortcut.id } : undefined
        if (!destination) return { kind: "unavailable" }
        const saved = await host({ kind: "choose", acct: account.key, site: request.purpose === "music-quick-save" ? "music" : "www", destination, purpose: purposes[request.purpose] })
        return saved ? { kind: "saved", destination } : { kind: "cancelled" }
      },
      async manage({ account }) { await host({ kind: "manage", acct: account.key }) }
    },
    open: destination => destination === "settings" ? page.openSettings() : page.open(destination === "sign-in"
      ? "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F" : "https://www.youtube.com/")
  }
  const text = createFirstRunText(page.i18n)
  return { text, pageState, owner: createFirstRunOwner(page.backend, services, page.platform, text) }
}
