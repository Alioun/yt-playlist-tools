<script lang="ts">
  import clsx from "clsx"
  import type { I18n } from "../../shared/i18n"
  import { bannerTone, type Banner } from "../lib/notices"
  import Button from "./Button.svelte"
  import Glyph from "./Glyph.svelte"

  export type BannerAction = "review" | "give-access" | "sign-in" | "open-youtube" | "details" | "show" | "switch-account"
  // One banner (UI-POP-10) as an inset card with its tone icon, title, one line and actions.
  let { banner, i18n, account, when, onaction }: {
    banner: Banner
    i18n: I18n
    account: string
    when: (at: number) => string
    onaction: (action: BannerAction, banner: Banner) => void
  } = $props()
  const tone = $derived(bannerTone[banner.kind])
  const copy = $derived.by((): { title: string; text?: string; actions: readonly [BannerAction, string][] } => {
    const m = i18n.message
    switch (banner.kind) {
      case "newer-version": return { title: m("banner_newer_title"), text: m("banner_newer_text"), actions: [] }
      case "upgrade": return { title: m("banner_upgrade_title"), actions: [["review", m("shell_review")]], text: m(
        banner.carried === "both" ? "banner_upgrade_both" : banner.carried === "auto-add" ? "banner_upgrade_autoAdd"
          : banner.carried === "shortcut" ? "banner_upgrade_shortcut" : "banner_upgrade_nothing") }
      case "consent": return { title: m("shell_waiting"), text: m("banner_consent_text"), actions: [["review", m("shell_review")]] }
      case "consent-version": return { title: m("banner_consentVersion_title", { version: String(banner.version) }), actions: [["review", m("shell_review")]] }
      case "access": return banner.site === "www"
        ? { title: m("firstRun_finish_noAccess"), text: m("banner_access_text"), actions: [["give-access", m("firstRun_finish_giveAccess")]] }
        : { title: m("firstRun_finish_noMusicAccess"), text: m("banner_access_text"), actions: [["give-access", m("firstRun_finish_giveMusicAccess")]] }
      case "signed-out": return { title: m("banner_signedOut_title"), actions: [["sign-in", m("firstRun_finish_signIn")]] }
      case "private": return { title: m("banner_private_title"), actions: [],
        text: m(banner.setup === "in-use" ? "banner_private_inUse" : "banner_private_none", { account }) }
      case "no-tab": return { title: m("banner_noTab_title"), actions: [["open-youtube", m("picker_openYouTube")]],
        text: banner.at === null ? m("banner_noTab_textNoStamp") : m("banner_noTab_text", { when: when(banner.at) }) }
      case "sync": return banner.status === "waiting" ? { title: m("banner_sync_waiting"), actions: [["details", m("strip_details")]] }
        : banner.status === "full" ? { title: m("sync_full"), text: m("banner_sync_fullText"), actions: [["details", m("strip_details")]] }
        : { title: m("banner_sync_update"), text: m("sync_updateNeeded"), actions: [["details", m("strip_details")]] }
      case "marks": return { actions: [["show", m("banner_show")]],
        title: banner.count === 1 ? m("banner_marks_one") : m("banner_marks_other", { count: i18n.number(banner.count) }),
        text: m(banner.count === 1 ? "banner_marks_text_one" : "banner_marks_text_other") }
      case "unclaimed": return { title: m("banner_unclaimed_title"), text: m("banner_unclaimed_text", { account }), actions: [["switch-account", m("note_switchAccount")]] }
    }
  })
</script>

<section
  data-banner={banner.kind}
  role={tone === "attention" ? "alert" : "status"}
  class={clsx("flex gap-2.5 rounded-xl border p-3 text-[13px]",
    tone === "attention" ? "border-warning-border bg-warning-soft" : tone === "info" ? "bg-info-soft border-transparent" : "bg-success-soft border-transparent")}
>
  <span class={clsx("mt-0.5 shrink-0", tone === "attention" ? "text-warning" : tone === "info" ? "text-info" : "text-success")}>
    <Glyph name={tone === "attention" ? "circle-alert" : tone === "info" ? "info" : "circle-check"} class="size-4" />
  </span>
  <div class="min-w-0 flex-1">
    <p class="font-semibold">{copy.title}</p>
    {#if copy.text}<p class="text-muted-foreground mt-0.5">{copy.text}</p>{/if}
    {#if copy.actions.length}
      <div class="mt-2 flex flex-wrap gap-2">
        {#each copy.actions as [action, label] (action)}
          <Button size="sm" variant={action === "review" ? "default" : "outline"} onclick={() => onaction(action, banner)}>{label}</Button>
        {/each}
      </div>
    {/if}
  </div>
</section>
