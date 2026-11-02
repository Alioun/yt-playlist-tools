<script lang="ts">
  import { onDestroy, untrack } from "svelte"
  import Button from "../../components/Button.svelte"
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
  import SyncCard from "../SyncCard.svelte"
  import OptionSwitch from "../OptionSwitch.svelte"

  // Settings › Everywhere (UI-SET-12, UI-SET-23): Settings sync, the undo key, Keys from any tab and the popup key.
  let { pageState, features }: { pageState: PageState; features: ReturnType<typeof createFeatureCopy> } = $props()
  const { i18n, backend, platform } = untrack(() => pageState.page)
  const settings = $derived(pageState.settings)
  const keyText = keyRecorderText(i18n)
  const keys = createKeySettingsClient({ backend, platform, commands: untrack(() => pageState.page.commands), text: keyText, chooser: { open: async () => {} } })
  onDestroy(() => keys.dispose())
  const browser = platform.browser === "firefox" ? "Firefox" : "Chrome"
  const anyOn = $derived(settings ? firstRunFeatures.some(feature => isOn(settings, feature.id as PageFeatureId)) : false)
  let commands = $state<readonly { readonly name: string; readonly key: Key | null }[] | null>(null)
  void untrack(() => pageState.page.commands.named()).then(rows => { commands = rows })
  const commandName = { "save-playing-song": "command_savePlayingSong", "like-playing-song": "command_likePlayingSong", "watch-later-current-video": "command_watchLaterCurrentVideo" } as const
  const shortcutPage = platform.browser === "firefox" ? "about:addons" : "chrome://extensions/shortcuts"
</script>

{#if settings}
  <div class="flex flex-col gap-4">
    <SyncCard {pageState} {features} />
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
