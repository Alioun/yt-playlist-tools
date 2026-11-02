<script lang="ts">
  import { onDestroy, untrack } from "svelte"
  import Button from "../components/Button.svelte"
  import Disclosure from "../components/Disclosure.svelte"
  import FeatureChoice from "../components/FeatureChoice.svelte"
  import Mark from "../components/Mark.svelte"
  import RichText from "../components/RichText.svelte"
  import { display } from "../../shared/keys"
  import type { NotePercentage } from "../../shared/contracts/ui-pages"
  import type { UpgradeDetails } from "../../shared/model/types"
  import type { Snapshot } from "../../shared/model/settings-view"
  import { featurePermissionNeeds } from "../backend/shared-settings"
  import { FIRST_RUN_DISCLOSURE_VERSION, matchesRenderedDisclosure } from "../backend/rendered-disclosure"
  import type { PageState } from "../lib/page-state.svelte"
  import type { FirstRunText } from "./text"
  import type { PageFeatureId } from "./features"

  // The upgrade note (UI-ONB-06, UI-ONB-07, REL-CON-04 to REL-CON-06): what carried over from 1.4.5, paused until
  // Agree, what's new, and the disclosure. Before Agree it shows only stored values and reads nothing from YouTube.
  let { pageState, text, markSrc, details }: { pageState: PageState; text: FirstRunText; markSrc: string; details: Snapshot<UpgradeDetails> } = $props()
  const { i18n, backend, platform } = untrack(() => pageState.page)
  const found = untrack(() => details)
  const keptAutoAdd = found.autoAdd.kept > 0
  const keyConverts = found.shortcut.key !== null && (found.shortcut.note === "ok" || found.shortcut.note === "ctrl-never-fired")
  const keptShortcut = found.shortcut.playlist || found.shortcut.key !== null || found.shortcut.note === "unconvertible"
  let autoAdd = $state(keptAutoAdd)
  let shortcuts = $state(keyConverts)
  let picked = $state<PageFeatureId[]>([])
  let answer = $state<"immediate" | "half">(!found.pct.authorised ? "half" : "immediate")
  let phase = $state<"review" | "not-now" | "agreeing" | "done">("review")
  let failure = $state<string | null>(null)
  let attempt = 1
  const others = text.features.firstRunFeatures.filter(feature => feature.id !== "auto-add" && (feature.id !== "shortcuts" || !keptShortcut))
  const selected = $derived([...autoAdd && keptAutoAdd ? ["auto-add" as const] : [], ...shortcuts && keyConverts ? ["shortcuts" as const] : [], ...picked])
  const count = $derived(selected.length)
  const key = found.shortcut.key ? display(found.shortcut.key, platform.os) : ""
  const percentage = (): NotePercentage => found.pct.wasUnset ? answer : "keep"

  // The note marks itself seen the first time it's on screen, so it never reopens (REL-CON-25).
  let seen = false
  const look = () => { if (!seen && document.visibilityState === "visible") { seen = true; void backend.call("ui.noteSeen", {}) } }
  look()
  document.addEventListener("visibilitychange", look)
  onDestroy(() => document.removeEventListener("visibilitychange", look))

  function agree() {
    const settings = pageState.settings
    if (!settings || phase === "agreeing") return
    const needs = selected.reduce((sum, feature) => {
      const next = featurePermissionNeeds({ kind: "feature", feature, value: true } as never, settings)
      return { music: sum.music || next.music, browserMenu: sum.browserMenu || next.browserMenu }
    }, { music: false, browserMenu: false })
    const grant = needs.music || needs.browserMenu ? backend.access.requestCombined(needs) : Promise.resolve(null)
    phase = "agreeing"; failure = null
    void (async () => {
      await grant
      if (!matchesRenderedDisclosure(platform.browser, text.disclosure)) { phase = "review"; failure = text.copy.consent.refused.unavailable; return }
      const result = await backend.call("ui.noteAgree", { change: { displayedVersion: FIRST_RUN_DISCLOSURE_VERSION, attempt: attempt++, selected, syncOn: false, percentage: percentage() } })
      await pageState.refreshAccess()
      if (result.kind === "answered" && result.result.kind === "agreed") { phase = "done"; void pageState.refreshAccount(); return }
      phase = "review"
      failure = result.kind === "answered" && result.result.kind === "not-agreed" ? text.copy.consent.refused[result.result.reason] : text.copy.consent.refused.unavailable
    })()
  }
  const outcome = $derived(!keptAutoAdd && !keptShortcut ? i18n.message("note_outcome_nothing")
    : pageState.account?.kind === "account" && pageState.account.source !== "last-account"
      ? pageState.account.signedIn ? i18n.message("note_outcome_checked", { account: pageState.accountName(pageState.account.acct) }) : i18n.message("note_outcome_signedOut")
      : i18n.message("note_outcome_noTab"))
  const agreeLabel = $derived(count === 0 ? i18n.message("firstRun_agree_none")
    : i18n.message(i18n.plural(count) === "one" ? "firstRun_agree_one" : "firstRun_agree_other", { count: i18n.number(count) }))
</script>

<div class="bg-brand-wash min-h-screen">
  <div class="mx-auto flex max-w-[700px] flex-col gap-6 px-6 pt-12 pb-10" data-upgrade-note>
    <header class="flex flex-col gap-4">
      <Mark src={markSrc} size={56} />
      <h1 class="text-[30px] leading-tight font-semibold tracking-[-0.022em]">{i18n.message("note_title")}</h1>
      <p class="text-[14.5px] leading-relaxed"><RichText parts={i18n.rich(found.credentialsDeleted ? "note_credentials" : "note_credentials_unknown")} /></p>
      <a class="text-primary text-[14px] hover:underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">{i18n.message("googleAccess_link")}</a>
      <p class="text-[14.5px] leading-relaxed"><RichText parts={i18n.rich("note_pin")} /></p>
      <p class="text-[14.5px] leading-relaxed"><RichText parts={i18n.rich("note_whyName")} /></p>
    </header>
    {#if pageState.access && !pageState.access.www}
      <section class="border-warning-border bg-warning-soft flex flex-col gap-2 rounded-xl border p-4 text-[14px]" role="alert">
        <p>{i18n.message("note_noAccess")}</p>
        <Button size="sm" class="self-start" onclick={() => { void backend.access.request("www").then(() => pageState.refreshAccess()) }}>{i18n.message("firstRun_finish_giveAccess")}</Button>
      </section>
    {/if}
    {#if phase === "done"}
      <section class="bg-card flex flex-col gap-3 rounded-2xl border p-6" role="status">
        <h2 class="text-xl font-semibold">✓ {i18n.message("note_done")}</h2>
        <p class="text-[14.5px]">{outcome}</p>
        <div class="flex gap-2"><Button variant="brand" onclick={() => pageState.page.open("https://www.youtube.com/")}>{i18n.message("firstRun_finish_openYouTube")}</Button>
          <Button variant="outline" onclick={() => pageState.page.openSettings()}>{i18n.message("firstRun_finish_openSettings")}</Button></div>
      </section>
    {:else}
      {#if keptAutoAdd || keptShortcut}
        <section class="flex flex-col gap-3" aria-labelledby="kept-heading">
          <h2 id="kept-heading" class="text-xl font-semibold">{i18n.message("note_kept_heading")} · <em class="text-muted-foreground font-normal">{i18n.message("note_kept_paused")}</em></h2>
          {#if keptAutoAdd}
            <div class="bg-card flex gap-3 rounded-xl border p-4 text-[14px]">
              <input id="kept-auto-add" type="checkbox" class="mt-1" bind:checked={autoAdd} />
              <span class="flex flex-col gap-1">
                <label for="kept-auto-add" class="font-semibold">{text.features.featureOf("auto-add").name}</label>
                <span>{i18n.message(found.pct.authorised ? i18n.plural(found.autoAdd.kept) === "one" ? "note_autoAdd_playlists_one" : "note_autoAdd_playlists_other"
                  : i18n.plural(found.autoAdd.kept) === "one" ? "note_autoAdd_neverAuthorised_one" : "note_autoAdd_neverAuthorised_other", { count: i18n.number(found.autoAdd.kept) })}</span>
                {#if found.autoAdd.dropped > 0}<span class="text-muted-foreground">{i18n.message(i18n.plural(found.autoAdd.dropped) === "one" ? "note_autoAdd_dropped_one" : "note_autoAdd_dropped_other", { count: i18n.number(found.autoAdd.dropped) })}</span>{/if}
                {#if found.pct.wasUnset}
                  <fieldset class="mt-1 flex flex-col gap-1">
                    <legend>{i18n.message(found.pct.authorised ? "note_question_unset" : "note_question_neverAuthorised")}</legend>
                    {#each (found.pct.authorised ? [["immediate", "note_question_unset_start"], ["half", "note_question_unset_half"]] : [["half", "note_question_neverAuthorised_half"], ["immediate", "note_question_start"]]) as const as [value, label] (value)}
                      <label class="flex items-center gap-2"><input type="radio" name="note-question" checked={answer === value} onchange={() => { answer = value }} />{i18n.message(label)}</label>
                    {/each}
                  </fieldset>
                {:else}
                  <span>{i18n.message("note_autoAdd_percent", { percent: i18n.number(found.pct.value) })}</span>
                {/if}
                <span class="text-muted-foreground">{i18n.message("note_autoAdd_counts")} {i18n.message("note_autoAdd_once")} {i18n.message(found.feedback ? "note_autoAdd_feedbackOn" : "note_autoAdd_feedbackOff")} {i18n.message("note_autoAdd_shorts")}</span>
              </span>
            </div>
          {/if}
          {#if keptShortcut}
            <div class="bg-card flex gap-3 rounded-xl border p-4 text-[14px]">
              <input id="kept-shortcuts" type="checkbox" class="mt-1" bind:checked={shortcuts} disabled={!keyConverts} />
              <span class="flex flex-col gap-1">
                <label for="kept-shortcuts" class="font-semibold">{text.features.featureOf("shortcuts").name}</label>
                {#if found.shortcut.note === "unconvertible"}<span>{i18n.message("note_shortcuts_unconvertible", { raw: found.shortcut.raw })}</span>
                {:else if found.shortcut.note === "no-key"}<span>{i18n.message("note_shortcuts_noKey")}</span>
                {:else if found.shortcut.note === "no-playlist"}<span>{i18n.message("note_shortcuts_noPlaylist", { key })}</span>
                {:else}
                  <span>{i18n.message("note_shortcuts_saves", { key })}</span>
                  {#if found.shortcut.note === "ctrl-never-fired"}<span>{i18n.message("note_shortcuts_ctrlFixed", { key })}</span>{/if}
                  <span class="text-muted-foreground">{i18n.message("note_shortcuts_bareKey")} {i18n.message("note_shortcuts_alsoNew")}</span>
                {/if}
              </span>
            </div>
          {/if}
        </section>
      {/if}
      <section class="flex flex-col gap-3" aria-labelledby="new-heading">
        <h2 id="new-heading" class="text-xl font-semibold">{i18n.message("note_new_heading")}</h2>
        <p class="text-muted-foreground text-[14px]">{i18n.message("note_new_lead")}</p>
        {#each others as feature (feature.id)}
          <FeatureChoice name={feature.name} description={feature.description} footprint={feature.footprint} footprintLabel={text.features.footprintText[feature.footprint]}
            checked={picked.includes(feature.id)} onchange={next => { picked = next ? [...picked, feature.id] : picked.filter(id => id !== feature.id) }} />
        {/each}
      </section>
      <section class="flex flex-col gap-4">
        <Disclosure context="upgrade-note" text={text.disclosure} browser={platform.browser} level={2} />
        {#if failure}<p role="alert" class="text-destructive text-[14px]">{failure}</p>{/if}
        {#if phase === "not-now"}
          <p role="status" class="text-[14px]">{i18n.message("note_notNow")}</p>
        {/if}
        <div class="flex flex-wrap gap-2">
          <Button variant="brand" size="lg" pending={phase === "agreeing"} onclick={agree}>{agreeLabel}</Button>
          {#if phase !== "not-now"}<Button variant="outline" size="lg" onclick={() => { phase = "not-now" }}>{i18n.message("firstRun_consent_notNow")}</Button>{/if}
        </div>
      </section>
    {/if}
  </div>
</div>
