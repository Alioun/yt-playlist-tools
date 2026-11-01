import type { I18n, RichPart } from "../../shared/i18n"
import type { AgreementRefusal, ChoiceFailure } from "./owner"
import type { BrowserKind } from "./features"

export type DisclosureContext = "first-run" | "upgrade-note" | "feature"
export type DisclosureItem = { readonly parts: readonly RichPart[]; readonly provisional?: "ticket-25-cookie" }
export const policyUrl = "https://alioun.github.io/yt-playlist-tools/privacy/"

export function createDisclosure(i18n: I18n) {
  const headings = {
    "first-run": i18n.message("disclosure_heading_first_run"),
    "upgrade-note": i18n.message("disclosure_heading_upgrade_note"),
    "feature": i18n.message("disclosure_heading_feature"),
  } satisfies Record<DisclosureContext, string>
  return {
    headings,
    canonical(browser: BrowserKind): readonly string[] {
      return [i18n.canonical("disclosure_heading_first_run"), i18n.canonical("disclosure_intro"),
        i18n.canonical("disclosure_bullet_1"), i18n.canonical("disclosure_bullet_2"), i18n.canonical("disclosure_bullet_3"),
        i18n.canonical("disclosure_bullet_4"), i18n.canonical("disclosure_bullet_5"), i18n.canonical("disclosure_bullet_6"),
        i18n.canonical(browser === "firefox" ? "disclosure_closing_firefox" : "disclosure_closing_chrome"),
        i18n.canonical("disclosure_policyLabel"), policyUrl]
    },
    intro: i18n.message("disclosure_intro"),
    items: [
      { parts: i18n.rich("disclosure_bullet_1") },
      { parts: i18n.rich("disclosure_bullet_2") },
      { parts: i18n.rich("disclosure_bullet_3") },
      { parts: i18n.rich("disclosure_bullet_4"), provisional: "ticket-25-cookie" },
      { parts: i18n.rich("disclosure_bullet_5") },
      { parts: i18n.rich("disclosure_bullet_6") },
    ] satisfies readonly DisclosureItem[],
    closing: { chrome: i18n.message("disclosure_closing_chrome"), firefox: i18n.message("disclosure_closing_firefox") } satisfies Record<BrowserKind, string>,
    policyLabel: i18n.message("disclosure_policyLabel"),
    policyUrl
  }
}

export function createFirstRunCopy(i18n: I18n) {
  const firstRunCopy = {
    welcome: i18n.message("firstRun_welcome"),
    intro: i18n.message("firstRun_intro"),
    steps: [i18n.message("firstRun_step_1"), i18n.message("firstRun_step_2"), i18n.message("firstRun_step_3")],
    stepsLabel: i18n.message("firstRun_stepsLabel"),
    pick: {
      heading: i18n.message("firstRun_pick_heading"),
      lead: i18n.message("firstRun_pick_lead"),
      syncLead: i18n.message("firstRun_pick_syncLead"),
      looking: i18n.message("firstRun_pick_looking"),
      found: i18n.rich("firstRun_pick_found"),
      notFound: i18n.message("firstRun_pick_notFound"),
      updateNeeded: i18n.message("firstRun_pick_updateNeeded"),
      lookupFailed: i18n.message("firstRun_pick_lookupFailed"),
      fromSync: i18n.message("firstRun_pick_fromSync"),
      pageHint: i18n.message("firstRun_pick_pageHint"),
      musicAccess: {
        chrome: i18n.message("firstRun_pick_musicAccess"), firefox: i18n.message("firstRun_pick_musicAccess_firefox")
      } satisfies Record<BrowserKind, string>,
      footer: i18n.message("firstRun_pick_footer"),
      continue: (n: number) => n ? i18n.message(i18n.plural(n) === "one" ? "firstRun_continue_one" : "firstRun_continue_other", { count: i18n.number(n) }) : i18n.message("firstRun_continue_none")
    },
    consent: {
      lead: (n: number) => n ? i18n.plural(n) === "one" ? i18n.message("firstRun_consentLead_one") : i18n.message("firstRun_consentLead_other", { count: i18n.number(n) }) : i18n.message("firstRun_consentLead_none"),
      picked: i18n.message("firstRun_consent_picked"),
      agree: (n: number) => n ? i18n.message(i18n.plural(n) === "one" ? "firstRun_agree_one" : "firstRun_agree_other", { count: i18n.number(n) }) : i18n.message("firstRun_agree_none"),
      agreeing: i18n.message("firstRun_consent_agreeing"),
      notNow: i18n.message("firstRun_consent_notNow"),
      change: i18n.message("firstRun_consent_change"),
      refused: {
        "sync-full": i18n.message("firstRun_consent_refused_sync_full"),
        "update-needed": i18n.message("firstRun_consent_refused_update_needed"),
        invalid: i18n.message("firstRun_consent_refused_invalid"),
        rejected: i18n.message("firstRun_consent_refused_rejected"),
        unconfirmed: i18n.message("firstRun_consent_refused_unconfirmed"),
        unavailable: i18n.message("firstRun_consent_refused_unavailable"),
        "join-required": i18n.message("firstRun_consent_refused_join_required")
      } satisfies Record<AgreementRefusal, string>
    },
    notNow: {
      strong: i18n.message("firstRun_notNow_strong"),
      rest: i18n.message("firstRun_notNow_rest"),
      back: i18n.message("firstRun_notNow_back")
    },
    finish: {
      heading: i18n.message("firstRun_finish_heading"),
      leadOn: i18n.message("firstRun_finish_leadOn"),
      leadOff: i18n.message("firstRun_finish_leadOff"),
      loading: i18n.message("firstRun_finish_loading"),
      unavailable: i18n.message("firstRun_finish_unavailable"),
      noAccess: i18n.message("firstRun_finish_noAccess"),
      noAccessRest: i18n.message("firstRun_finish_noAccessRest"),
      giveAccess: i18n.message("firstRun_finish_giveAccess"),
      noMusicAccess: i18n.message("firstRun_finish_noMusicAccess"),
      noMusicAccessRest: i18n.message("firstRun_finish_noMusicAccessRest"),
      giveMusicAccess: i18n.message("firstRun_finish_giveMusicAccess"),
      accessDenied: i18n.message("firstRun_finish_accessDenied"),
      noTab: i18n.message("firstRun_finish_noTab"),
      noTabRest: i18n.message("firstRun_finish_noTabRest"),
      signedOut: i18n.message("firstRun_finish_signedOut"),
      signedOutRest: i18n.message("firstRun_finish_signedOutRest"),
      signIn: i18n.message("firstRun_finish_signIn"),
      accountLead: i18n.message("firstRun_finish_accountLead"),
      ready: i18n.message("firstRun_finish_ready"),
      gatherReady: i18n.message("firstRun_finish_gatherReady"),
      needsAccess: i18n.message("firstRun_finish_needsAccess"),
      needsBrowserMenu: i18n.message("firstRun_finish_needsBrowserMenu"),
      alsoOnMusicHeld: i18n.message("firstRun_finish_alsoOnMusicHeld"),
      needsAccount: i18n.message("firstRun_finish_needsAccount"),
      choose: i18n.message("firstRun_finish_choose"),
      chooseFor: (feature: string) => i18n.message("firstRun_chooseFor", { feature }),
      choosing: i18n.message("firstRun_finish_choosing"),
      noneChosen: i18n.message("firstRun_finish_noneChosen"),
      noPlaylists: i18n.message("firstRun_finish_noPlaylists"),
      autoAddLead: i18n.message("firstRun_finish_autoAddLead"),
      shortcutSaves: (key: string) => i18n.message("firstRun_shortcutSaves", { key }),
      quickSaves: i18n.message("firstRun_finish_quickSaves"),
      musicSaves: i18n.message("firstRun_finish_musicSaves"),
      choiceFailed: {
        "picker-unavailable": i18n.message("firstRun_finish_choiceFailed_picker_unavailable"),
        private: i18n.message("firstRun_finish_choiceFailed_private"),
        rejected: i18n.message("firstRun_finish_choiceFailed_rejected"),
        unconfirmed: i18n.message("firstRun_finish_choiceFailed_unconfirmed"),
        unavailable: i18n.message("firstRun_finish_choiceFailed_unavailable")
      } satisfies Record<ChoiceFailure, string>,
      openYouTube: i18n.message("firstRun_finish_openYouTube"),
      openSettings: i18n.message("firstRun_finish_openSettings")
    }
  } as const
  return firstRunCopy
}
