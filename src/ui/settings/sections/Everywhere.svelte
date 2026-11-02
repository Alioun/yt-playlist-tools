<script lang="ts">
  import { onDestroy, untrack } from "svelte"
  import Button from "../../components/Button.svelte"
  import Switch from "../../components/Switch.svelte"
  import KeyRecorder from "../../keys/KeyRecorder.svelte"
  import { createKeySettingsClient } from "../../keys/client"
  import { keyRecorderText } from "../../keys/text"
  import { display } from "../../../shared/keys"
  import type { Key } from "../../../shared/model/types"
  import type { createFeatureCopy, PageFeatureId } from "../../onboarding/features"
  import { firstRunFeatures } from "../../onboarding/features"
  import type { PageState } from "../../lib/page-state.svelte"
  import { isOn } from "../../lib/held"
  import FeatureSwitchCard from "../FeatureSwitchCard.svelte"
  import OptionSwitch from "../OptionSwitch.svelte"

  // Settings › Everywhere (UI-SET-12, UI-SET-23): Settings sync, the undo key, Keys from any tab and the popup key.
  let { pageState, features }: { pageState: PageState; features: ReturnType<typeof createFeatureCopy> } = $props()
  const { i18n, backend, platform } = untrack(() => pageState.page)
  const settings = $derived(pageState.settings)
  const device = $derived(pageState.ready?.device.kind === "current" ? pageState.ready.device.device : null)
  const status = $derived(pageState.ready?.sync?.status ?? "off")
  // SYNC-14: kept filters are those of playlists their account no longer auto-adds to.
  const keptFilters = $derived((pageState.ready?.setups ?? []).reduce((count, row) =>
    count + [...row.filters.keys()].filter(playlist => !row.setup.autoAdd.some(entry => entry.pl === playlist)).length, 0))
  let removing = $state(false), removeFailed = $state(false)
  async function removeKept() {
    removing = true; removeFailed = false
    try {
      const answer = await backend.call("ui.removeKeptFilters", {})
      removeFailed = !(answer.kind === "answered" && answer.result.kind === "removed")
    } finally { removing = false }
  }
  const keyText = keyRecorderText(i18n)
  const keys = createKeySettingsClient({ backend, platform, commands: untrack(() => pageState.page.commands), text: keyText, chooser: { open: async () => {} } })
  onDestroy(() => keys.dispose())
  const browser = platform.browser === "firefox" ? "Firefox" : "Chrome"
  const anyOn = $derived(settings ? firstRunFeatures.some(feature => isOn(settings, feature.id as PageFeatureId)) : false)
  let commands = $state<readonly { readonly name: string; readonly key: Key | null }[] | null>(null)
  void untrack(() => pageState.page.commands.named()).then(rows => { commands = rows })
  const commandName = { "save-playing-song": "command_savePlayingSong", "like-playing-song": "command_likePlayingSong", "watch-later-current-video": "command_watchLaterCurrentVideo" } as const
  const shortcutPage = platform.browser === "firefox" ? "about:addons" : "chrome://extensions/shortcuts"
  const syncLine = $derived(!device?.syncOn ? i18n.message("set_sync_off") : status === "joining" ? i18n.message("set_sync_joining")
    : status === "waiting" ? i18n.message("banner_sync_waiting") : status === "full" ? i18n.message("sync_full") : status === "update-needed" ? i18n.message("sync_updateNeeded") : i18n.message("set_sync_ok"))
</script>

{#if settings}
  <div class="flex flex-col gap-4">
    <section id="feature-sync" data-feature-card="sync" class="bg-card rounded-2xl border p-5">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h3 class="text-[15px] font-semibold">{features.syncFeature.name}</h3>
          <p class="text-muted-foreground mt-1 text-[13.5px]">{i18n.message(platform.browser === "firefox" ? "set_syncHelp_firefox" : "set_syncHelp_chrome")}</p>
          <p class="mt-2 text-[13.5px]" role="status">{syncLine}</p>
          {#if device?.syncOn && status === "full" && keptFilters > 0}
            <div class="mt-2 flex flex-col items-start gap-1">
              <Button size="sm" variant="outline" pending={removing} onclick={removeKept}>{i18n.message("sync_removeKeptFilters")}</Button>
              <p class="text-muted-foreground text-[12.5px]">{i18n.message("sync_removeKeptFilters_hint")}</p>
              {#if removeFailed}<p role="status" class="text-destructive text-[12.5px]">{i18n.message("filter_failed")}</p>{/if}
            </div>
          {/if}
          <p class="text-muted-foreground mt-1 text-[12.5px]">{i18n.message("set_syncSwitchLater")}</p>
        </div>
        <Switch checked={device?.syncOn ?? false} label={features.syncFeature.name} disabled onchange={() => {}} />
      </div>
    </section>
    {#if anyOn}
      <section class="bg-card rounded-2xl border p-5">
        <div class="flex items-center justify-between gap-3">
          <div><h3 class="text-[15px] font-semibold">{i18n.message("set_undoKey")}</h3><p class="text-muted-foreground text-[13px]">{i18n.message("set_undoKeyLine")}</p></div>
          {#await keys.ready then}
            <KeyRecorder controller={keys.recorder({ kind: "undo" })} text={keyText} title={i18n.message("set_undoKey")} showTitle={false} targetName={() => i18n.message("set_undoKey")} os={platform.os} {browser} />
          {/await}
        </div>
      </section>
    {/if}
    <FeatureSwitchCard {pageState} {features} feature="any-tab-keys">
      {#if commands}
        <ul class="flex flex-col gap-1 text-[13.5px]">
          {#each commands.filter(row => row.name in commandName) as row (row.name)}
            <li class="flex justify-between gap-3"><span>{i18n.message(commandName[row.name as keyof typeof commandName])}</span>
              <span class="text-muted-foreground font-mono">{row.key ? display(row.key, platform.os) : i18n.message("recorder_noKey")}</span></li>
          {/each}
        </ul>
      {/if}
      <Button size="sm" variant="outline" class="mt-2" onclick={() => pageState.page.open(shortcutPage)}>{i18n.message("set_anyTabSetKeys")}</Button>
      {#if pageState.access && !pageState.access.music}
        <p class="text-warning mt-2 text-[12.5px]">{i18n.message("access_musicKeysMissing")}
          <Button size="sm" variant="link" onclick={() => { void backend.access.request("music").then(() => pageState.refreshAccess()) }}>{i18n.message("held_giveAccess")}</Button></p>
      {/if}
      <OptionSwitch {pageState} field="anyTabKeys.feedback" checked={settings.anyTabKeys.feedback} label={i18n.message("set_feedback")} />
    </FeatureSwitchCard>
    {#if !settings.anyTabKeys.on}<p class="text-muted-foreground -mt-2 px-1 text-[12.5px]">{i18n.message("set_anyTabOff")}</p>{/if}
    <p class="text-muted-foreground text-[13px]">{i18n.message("set_popupKey")}
      <Button size="sm" variant="link" onclick={() => pageState.page.open(shortcutPage)}>{i18n.message("set_anyTabSetKeys")}</Button></p>
  </div>
{/if}
