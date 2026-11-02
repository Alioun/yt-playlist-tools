<script lang="ts">
  import { untrack } from "svelte"
  import Button from "../components/Button.svelte"
  import Switch from "../components/Switch.svelte"
  import { display } from "../../shared/keys/policy"
  import type { createFeatureCopy, PageFeatureId } from "../onboarding/features"
  import type { PageState } from "../lib/page-state.svelte"
  import { heldMessage, heldReason, isOn } from "../lib/held"
  import { musicActionName, musicButtons, summary } from "../lib/summaries"
  import DestinationChooser from "../features/DestinationChooser.svelte"
  import MusicButtons from "../features/MusicButtons.svelte"
  import FeatureRow from "./FeatureRow.svelte"
  import PlayingNow from "./PlayingNow.svelte"
  import type { SheetTarget } from "../features/source"

  // The popup's YouTube Music tab (UI-POP-16, UI-POP-18), its own chunk.
  let { pageState, features, ontoggle, ongiveaccess, onsave }: {
    pageState: PageState
    features: ReturnType<typeof createFeatureCopy>
    ontoggle: (feature: PageFeatureId, next: boolean) => void
    ongiveaccess: (feature: PageFeatureId) => void
    /** Opens the popup's picker sheet for the playing song (YM-POP-4). */
    onsave?: (target: SheetTarget) => void
  } = $props()
  const { i18n, backend, platform } = untrack(() => pageState.page)
  const settings = $derived(pageState.settings)
  const access = $derived(pageState.access ?? { www: true, music: true, browserMenu: true })
  let line = $state<string | null>(null)
  async function section(value: boolean) {
    if (!settings) return
    const answer = await backend.changeFeatureSetting({ kind: "music-section", value }, settings)
    line = answer.kind === "refused" ? i18n.message("pop_switchFailed") : null
  }
  async function alsoOnMusic(value: boolean) {
    if (!settings) return
    const answer = await backend.changeFeatureSetting({ kind: "shortcuts-music", value }, settings)
    await pageState.refreshAccess()
    line = answer.kind === "refused" ? i18n.message(answer.reason === "site-access" ? "access_musicShortcutsDenied" : "pop_switchFailed") : null
  }
  const facts = $derived(settings ? { settings, setup: pageState.setup, account: pageState.accountName(), signedIn: pageState.signedIn, paused: pageState.paused,
    os: platform.os, title: (id: Parameters<typeof pageState.title>[0]) => pageState.title(id) } : null)
  const musicOn = $derived(settings ? isOn(settings, "music-actions") || isOn(settings, "music-keys") : false)
  const keys = $derived(settings ? [...musicButtons.filter(button => button !== "bar"), "picker" as const] : [])
</script>

{#if settings && facts}
  <div class="flex flex-col gap-3">
    <section class="bg-card flex items-center gap-3 rounded-xl border p-3">
      <div class="min-w-0 flex-1">
        <p class="text-[13.5px] font-medium">{i18n.message("music_sectionTitle")}</p>
        <p class="text-muted-foreground text-[12px]">{i18n.message(settings.musicSection ? "music_sectionOn" : "music_sectionOff")}</p>
      </div>
      <Switch checked={settings.musicSection} label={i18n.message("music_sectionTitle")} disabled={!pageState.editable} onchange={section} />
    </section>
    {#if line}<p role="status" class="text-destructive text-[12px]">{line}</p>{/if}
    {#if settings.musicSection}
      {#if pageState.agreed && access.music}<PlayingNow {pageState} {onsave} />{/if}
      <ul class="bg-card rounded-xl border" aria-label={i18n.message("site_music")}>
        {#each ["music-actions", "music-keys"] as const as feature (feature)}
          {@const reason = heldReason(feature, settings, pageState.agreed, access)}
          <FeatureRow {feature} name={features.featureOf(feature).name} summary={summary(i18n, feature, facts)} on={isOn(settings, feature)}
            held={reason ? i18n.message(heldMessage[reason]) : null} disabled={!pageState.editable} unfoldable={pageState.agreed} onswitch={next => ontoggle(feature, next)}>
            {#snippet action()}
              {#if reason === "site-access"}<Button size="sm" variant="outline" onclick={() => ongiveaccess(feature)}>{i18n.message("held_giveAccess")}</Button>{/if}
            {/snippet}
            {#snippet details()}
              {#if feature === "music-actions"}
                <MusicButtons {pageState} />
              {:else}
                <ul class="flex flex-col gap-1 text-[12.5px]">
                  {#each keys as action (action)}
                    {@const key = settings.musicKeys.keys[action]}
                    <li class="flex justify-between gap-2"><span>{action === "picker" ? i18n.message("musicButton_picker") : i18n.message(musicActionName[action])}</span>
                      <span class="text-muted-foreground font-mono">{key ? display(key, platform.os) : i18n.message("summary_noKey")}</span></li>
                  {/each}
                  <li class="flex justify-between gap-2"><span>{i18n.message("music_keysUndo")}</span>
                    <span class="text-muted-foreground font-mono">{settings.undoKey ? display(settings.undoKey, platform.os) : i18n.message("summary_noKey")}</span></li>
                </ul>
                <p class="text-muted-foreground mt-1.5 text-[12px]">{i18n.message("music_keysActsOn")}</p>
                <Button size="sm" variant="outline" class="mt-1.5" onclick={() => pageState.page.openSettings("feature-music-keys")}>{i18n.message("music_changeKeys")}</Button>
              {/if}
            {/snippet}
          </FeatureRow>
        {/each}
        <li class="flex min-h-[54px] items-center gap-3 px-3 py-2">
          <div class="min-w-0 flex-1 pl-11">
            <p class="text-[13.5px] font-medium">{i18n.message("music_psName")}</p>
            <p class="text-muted-foreground text-[12px]">{i18n.message(settings.shortcuts.on ? "music_psOn" : "music_psOff")}</p>
            {#if settings.shortcuts.on && settings.shortcuts.music && !access.music}<p class="text-warning text-[12px]">{i18n.message("held_siteAccess")}</p>{/if}
          </div>
          {#if settings.shortcuts.on && settings.shortcuts.music && !access.music}
            <Button size="sm" variant="outline" onclick={() => ongiveaccess("music-actions")}>{i18n.message("held_giveAccess")}</Button>
          {/if}
          <Switch checked={settings.shortcuts.music} held={settings.shortcuts.on && settings.shortcuts.music && !access.music} label={i18n.message("music_psName")}
            disabled={!settings.shortcuts.on || !pageState.editable} onchange={alsoOnMusic} />
        </li>
        {#if musicOn && pageState.agreed}
          <li class="flex flex-col gap-1 px-3 py-2 pl-14">
            <p class="text-[13.5px] font-medium">{i18n.message("music_saveName")}</p>
            <p class="text-muted-foreground text-[12px]">{pageState.title(pageState.setup?.setup.musicSave as never ?? null)
              ? i18n.message("music_saveSet", { playlist: pageState.title(pageState.setup?.setup.musicSave as never)! }) : i18n.message("music_saveUnset")}</p>
            <DestinationChooser {pageState} site="music" destination={{ kind: "music-save" }} label={i18n.message("music_saveName")}
              purpose={{ kind: "named", title: i18n.message("music_saveName"), subtitle: i18n.message("music_saveSubtitle") }} />
          </li>
        {/if}
      </ul>
    {/if}
  </div>
{/if}
