<script lang="ts">
  import { onDestroy, untrack } from "svelte"
  import type { BannerAction } from "../components/BannerCard.svelte"
  import Button from "../components/Button.svelte"
  import Glyph from "../components/Glyph.svelte"
  import Mark from "../components/Mark.svelte"
  import SiteTabs from "../components/SiteTabs.svelte"
  import type { Site } from "../../shared/contracts/vocabulary"
  import type { FeatureSettingAnswer } from "../../shared/contracts/shared-settings"
  import { createFeatureCopy, type PageFeatureId } from "../onboarding/features"
  import type { ExtensionPage } from "../shell/start"
  import { PageState } from "../lib/page-state.svelte"
  import { banners, type Banner } from "../lib/notices"
  import { accessSite, heldMessage, heldReason, isOn, shortcutsMusicHeld, wwwRows, type Held } from "../lib/held"
  import { summary } from "../lib/summaries"
  import { healthLine, stripLine } from "../lib/health"
  import { relativeTime } from "../lib/time"
  import { GatherRow } from "../lib/gather.svelte"
  import type { GatherLineAction } from "../../shared/contracts/ui-gather"
  import FeatureRow from "./FeatureRow.svelte"

  let { page, markSrc }: { page: ExtensionPage; markSrc: string } = $props()
  const pageState = new PageState(untrack(() => page))
  const { i18n } = untrack(() => page)
  const features = createFeatureCopy(i18n)
  const gatherRow = new GatherRow(untrack(() => page))
  onDestroy(() => { pageState.dispose(); gatherRow.dispose() })
  const SITE_KEY = "perchling.popupSite"
  let chosenSite = $state<Site | null>(null)
  let lines = $state<Partial<Record<PageFeatureId, { text: string; tone: "muted" | "warning" | "destructive" }>>>({})
  let sheet = $state<{ readonly kind: "consent"; readonly feature: PageFeatureId } | { readonly kind: "recent" } | null>(null)
  let pausing = $state(false)

  const view = $derived(pageState.ready)
  const settings = $derived(pageState.settings)
  const device = $derived(view?.device.kind === "current" ? view.device.device : null)
  const openedOn = $derived(pageState.status?.kind === "status" && pageState.status.tab.kind === "site" ? pageState.status.tab.site : null)
  const site = $derived<Site>(chosenSite ?? openedOn ?? (localStorage.getItem(SITE_KEY) === "music" ? "music" : "www"))
  const shown = $derived(view ? banners({ view, sites: [site], tab: pageState.status?.kind === "status" ? pageState.status.tab : null,
    account: pageState.account, access: pageState.access, private: pageState.private }) : [])
  const banner = $derived<Banner | undefined>(shown[0])
  const strip = $derived(pageState.status?.kind === "status" ? stripLine(i18n, features, pageState.status.health.filter(row => row.site === site)) : null)
  const access = $derived(pageState.access ?? { www: true, music: true, browserMenu: true })
  const recentButton = $derived(pageState.agreed && device?.recentAdds !== false)
  const signInUrl = "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F"
  // Gather tabs' row (UI-POP-35): its button, Enter while nothing has focus, and the line's one action.
  const gatherReady = $derived(settings !== null && isOn(settings, "gather") && pageState.agreed && held("gather") === null)
  let choosing = $state(false)
  $effect(() => { if (gatherReady) untrack(() => { void gatherRow.refresh() }) })
  async function gather(retry?: string) {
    choosing = false
    const answer = await gatherRow.gather(retry)
    if (answer?.action?.kind === "choose") choosing = true
  }
  function gatherKey(event: KeyboardEvent) {
    if (event.key !== "Enter" || event.defaultPrevented || event.repeat || sheet !== null || site !== "www" || !gatherReady || gatherRow.running) return
    const focused = document.activeElement
    if (focused && focused !== document.body) return
    event.preventDefault()
    void gather()
  }
  const actionLabels = { undo: "toast_action_undo", retry: "toast_action_try_again", choose: "toast_action_choose", "sign-in": "toast_action_sign_in",
    "open-youtube": "picker_openYouTube" } as const satisfies Record<GatherLineAction["kind"], Parameters<typeof i18n.message>[0]>
  function gatherAct(action: GatherLineAction) {
    switch (action.kind) {
      case "undo": void gatherRow.undo(action.id); break
      case "retry": void gather(action.id); break
      case "choose": choosing = true; break
      case "sign-in": page.open(signInUrl); break
      case "open-youtube": page.open("https://www.youtube.com/"); break
    }
  }

  function select(next: Site) {
    chosenSite = next
    try { localStorage.setItem(SITE_KEY, next) } catch {}
  }
  function held(feature: PageFeatureId): Held | null {
    return settings ? heldReason(feature, settings, pageState.agreed, access) : null
  }
  function giveAccess(feature: PageFeatureId) {
    const reason = held(feature)
    const request = reason === "browser-menu" ? page.backend.access.requestCombined({ music: false, browserMenu: true })
      : page.backend.access.request(accessSite(feature))
    void request.then(() => pageState.refreshAccess())
  }
  const refusal = (answer: Extract<FeatureSettingAnswer, { kind: "refused" }>) => {
    switch (answer.reason) {
      case "site-access": return i18n.message("pop_switchRefused_site_access")
      case "browser-menu-permission": return i18n.message("pop_switchRefused_browser_menu_permission")
      case "sync-full": return i18n.message("pop_switchRefused_sync_full")
      case "update-needed": return i18n.message("pop_switchRefused_update_needed")
      default: return i18n.message("pop_switchFailed")
    }
  }
  async function toggle(feature: PageFeatureId, next: boolean) {
    if (next && !pageState.agreed) { sheet = { kind: "consent", feature }; return }
    const answer = await pageState.switchFeature(feature, next)
    const { [feature]: _, ...rest } = lines
    lines = answer.kind === "refused" ? { ...rest, [feature]: { text: refusal(answer), tone: "destructive" } }
      : feature === "shortcuts" && next && answer.limitedMusic ? { ...rest, shortcuts: { text: i18n.message("access_musicShortcutsDenied"), tone: "warning" } } : rest
  }
  async function pause() {
    pausing = true
    const answer = await page.backend.call("ui.pause", { paused: !pageState.paused })
    pausing = false
    const { ["auto-add"]: _, ...rest } = lines
    lines = answer.kind === "answered" && answer.result.kind === "paused" ? rest : { ...rest, "auto-add": { text: i18n.message("pop_pauseFailed"), tone: "destructive" } }
    await pageState.refreshStatus()
  }
  function act(action: BannerAction, shownBanner: Banner) {
    switch (action) {
      case "review": page.openFirstRun(); break
      case "give-access": if (shownBanner.kind === "access") void page.backend.access.request(shownBanner.site).then(() => pageState.refreshAccess()); break
      case "sign-in": page.open(signInUrl); break
      case "open-youtube": page.open("https://www.youtube.com/"); break
      case "details": page.openSettings("everywhere"); break
      case "show": page.openSettings("feature-auto-add"); break
      case "switch-account": page.open("https://www.youtube.com/channel_switcher"); break
    }
  }
  function name(feature: PageFeatureId) { return features.featureOf(feature).name }
  function line(feature: PageFeatureId) {
    const own = lines[feature]
    if (own) return own
    if (feature === "gather" && gatherReady && gatherRow.line) return { text: gatherRow.line.text, tone: gatherRow.line.tone === "failure" ? "destructive" as const : "muted" as const }
    const health = pageState.status?.kind === "status" ? pageState.status.health.find(row => row.feature === feature && row.site === site) : undefined
    const text = healthLine(i18n, health)
    if (text) return { text, tone: "warning" as const }
    if (feature === "shortcuts" && settings && site === "www" && shortcutsMusicHeld(settings, access)) return { text: i18n.message("firstRun_finish_alsoOnMusicHeld"), tone: "muted" as const }
    return null
  }
  const summaryFacts = $derived(settings ? { settings, setup: pageState.setup, account: pageState.accountName(), signedIn: pageState.signedIn,
    paused: pageState.paused, os: page.platform.os, title: (id: Parameters<typeof pageState.title>[0]) => pageState.title(id) } : null)
</script>

<svelte:window onkeydown={gatherKey} />

{#snippet gatherAction()}
  {#if gatherRow.line?.action && !lines.gather}
    {@const action = gatherRow.line.action}
    <Button variant="link" size="sm" disabled={gatherRow.running} onclick={() => gatherAct(action)}>{i18n.message(actionLabels[action.kind])}</Button>
  {/if}
{/snippet}

<div class="bg-background text-foreground relative flex max-h-[600px] min-h-[420px] w-[360px] flex-col" data-popup>
  <header class="header-line relative flex h-[58px] shrink-0 items-center gap-2.5 px-3">
    <Mark src={markSrc} size={28} />
    <span class="text-[15px] font-semibold tracking-[-0.01em]">{i18n.message("extShortName")}</span>
    <span class="min-w-0 flex-1">
      {#if pageState.agreed}
        {#if pageState.account === null}
          <span aria-label={i18n.message("pop_readingAccount")} class="bg-muted block h-4 w-24 rounded motion-safe:animate-pulse"></span>
        {:else if pageState.acct}
          <span class="flex min-w-0 items-center gap-1.5 text-[12.5px]">
            {#if pageState.setup?.setup.label?.avatar}<img src={pageState.setup.setup.label.avatar} alt="" class="size-5 rounded-full" />{:else}<Glyph name="user" class="text-muted-foreground size-4" />{/if}
            <span class="truncate font-medium">{pageState.accountName()}</span>
            {#if pageState.setup?.setup.label?.handle}<span class="text-muted-foreground truncate">{pageState.setup.setup.label.handle}</span>{/if}
          </span>
        {/if}
      {/if}
    </span>
    {#if recentButton}
      <Button variant="ghost" size="sm" aria-label={i18n.message("pop_recentAdds")} onclick={() => { sheet = { kind: "recent" } }}><Glyph name="clock" /></Button>
    {/if}
    <Button variant="ghost" size="sm" aria-label={i18n.message("pop_openSettings")} onclick={() => page.openSettings()}><Glyph name="gear" /></Button>
  </header>

  {#if strip}
    <div class="border-warning-border bg-warning-soft flex items-center gap-2 border-b px-3 py-2 text-[12.5px]" role="status" data-strip>
      <Glyph name="triangle-alert" class="text-warning size-4 shrink-0" />
      <span class="min-w-0 flex-1">{strip}</span>
      <Button variant="link" size="sm" onclick={() => page.openSettings("diagnostics")}>{i18n.message("strip_details")}</Button>
    </div>
  {/if}

  <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
    {#if pageState.view?.kind === "unavailable"}
      <p class="text-muted-foreground text-sm">{i18n.message("shell_unavailable")}</p>
    {:else if view}
      {#if banner}
        {#await import("../components/BannerCard.svelte") then { default: Card }}
          <Card {banner} {i18n} account={pageState.accountName()} when={at => relativeTime(i18n, at)} onaction={act} />
        {/await}
      {/if}
      {#if banner?.kind !== "newer-version"}
        <SiteTabs selected={site} opened={openedOn} labels={{ www: i18n.message("site_www"), music: i18n.message("site_music") }} panel="popup-panel" onselect={select} />
        <div id="popup-panel" role="tabpanel">
          {#if site === "www" && settings && summaryFacts}
            <ul class="bg-card rounded-xl border" aria-label={i18n.message("site_www")}>
              {#each wwwRows as feature (feature)}
                {@const reason = held(feature)}
                {@const shownLine = line(feature)}
                <FeatureRow {feature} name={name(feature)} summary={summary(i18n, feature, summaryFacts)} on={isOn(settings, feature)}
                  held={reason ? i18n.message(heldMessage[reason]) : null} line={shownLine?.text ?? null} lineTone={shownLine?.tone}
                  disabled={!pageState.editable} unfoldable={pageState.agreed && ["auto-add", "shortcuts", "quick-save", "gather"].includes(feature)}
                  lineAction={feature === "gather" ? gatherAction : undefined} onswitch={next => toggle(feature, next)}>
                  {#snippet action()}
                    {#if reason === "site-access" || reason === "browser-menu"}
                      <Button size="sm" variant="outline" onclick={() => giveAccess(feature)}>{i18n.message(reason === "browser-menu" ? "held_allow" : "held_giveAccess")}</Button>
                    {:else if feature === "auto-add" && isOn(settings, feature) && pageState.agreed && !pageState.private}
                      <Button size="sm" variant="outline" pending={pausing} onclick={pause}>{i18n.message(pageState.paused ? "pop_resume" : "pop_pause")}</Button>
                    {:else if feature === "gather" && gatherReady}
                      <Button size="sm" variant="outline" pending={gatherRow.running} disabled={!pageState.editable} onclick={() => gather()}>{i18n.message("gather_button")}</Button>
                    {/if}
                  {/snippet}
                  {#snippet details()}
                    {#await import("../features/FeatureDetails.svelte") then { default: Details }}
                      <Details {pageState} {feature} variant="popup" />
                    {/await}
                  {/snippet}
                </FeatureRow>
              {/each}
            </ul>
            {#if choosing && gatherReady && pageState.acct}
              {#await import("../features/DestinationChooser.svelte") then { default: Chooser }}
                <div class="mt-2" data-gather-chooser>
                  <Chooser {pageState} destination={{ kind: "gather" }} label={i18n.message("gatherOpt_playlistLabel")} opened
                    purpose={{ kind: "gather", accountName: pageState.accountName() }} onchosen={() => { void gather() }} />
                </div>
              {/await}
            {/if}
          {:else if site === "music"}
            {#await import("./MusicTab.svelte") then { default: Music }}
              <Music {pageState} {features} ontoggle={toggle} ongiveaccess={giveAccess} />
            {/await}
          {/if}
        </div>
      {/if}
    {/if}
  </div>

  {#if sheet?.kind === "consent"}
    {#await import("./ConsentSheet.svelte") then { default: Consent }}
      <Consent {pageState} feature={sheet.feature} name={name(sheet.feature)} onclose={() => { sheet = null }} />
    {/await}
  {:else if sheet?.kind === "recent" && pageState.acct}
    {#await import("./RecentAddsSheet.svelte") then { default: Recent }}
      <Recent {pageState} acct={pageState.acct} onclose={() => { sheet = null }} />
    {/await}
  {/if}
</div>

<style>
  .header-line::after {
    content: ""; position: absolute; inset: auto 0 0; height: 1px;
    background: linear-gradient(90deg, var(--brand-teal), var(--brand-violet)); opacity: .55;
  }
</style>
