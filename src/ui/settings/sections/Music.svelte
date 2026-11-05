<script lang="ts">
  import { onDestroy, untrack } from "svelte"
  import Switch from "../../components/Switch.svelte"
  import KeyRecorder from "../../keys/KeyRecorder.svelte"
  import { createKeySettingsClient } from "../../keys/client"
  import { keyRecorderText } from "../../keys/text"
  import FeatureDetails from "../../features/FeatureDetails.svelte"
  import MusicButtons from "../../features/MusicButtons.svelte"
  import type { createFeatureCopy } from "../../onboarding/features"
  import type { PageState } from "../../lib/page-state.svelte"
  import { isOn } from "../../lib/held"
  import { musicActionName, musicButtons } from "../../lib/summaries"
  import FeatureSwitchCard from "../FeatureSwitchCard.svelte"
  import OptionSwitch from "../OptionSwitch.svelte"

  // Settings › YouTube Music (UI-SET-11), with the section switch in its header.
  let { pageState, features }: { pageState: PageState; features: ReturnType<typeof createFeatureCopy> } = $props()
  const { i18n, backend, platform } = untrack(() => pageState.page)
  const settings = $derived(pageState.settings)
  const keyText = keyRecorderText(i18n)
  const keys = createKeySettingsClient({ backend, platform, commands: untrack(() => pageState.page.commands), text: keyText, chooser: { open: async () => {} } })
  onDestroy(() => keys.dispose())
  const browser = platform.browser === "firefox" ? "Firefox" : "Chrome"
  const actions = [...musicButtons.filter(button => button !== "bar"), "picker"] as const
  let failed = $state(false)
  async function section(value: boolean) {
    if (!settings) return
    failed = (await backend.changeFeatureSetting({ kind: "music-section", value }, settings)).kind === "refused"
  }
  const quickSaveOnce = $derived(settings ? isOn(settings, "music-actions") ? "music-actions" : isOn(settings, "music-keys") ? "music-keys" : null : null)
</script>

{#if settings}
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-semibold">{i18n.message("site_music")}</h2>
        <p class="text-muted-foreground text-[13.5px]">{i18n.message(settings.musicSection ? "music_sectionOn" : "music_sectionOff")}</p>
      </div>
      <Switch checked={settings.musicSection} label={i18n.message("set_musicSection")} disabled={!pageState.editable} onchange={section} />
    </div>
    {#if failed}<p role="status" class="text-destructive text-[13px]">{i18n.message("pop_switchFailed")}</p>{/if}
    {#if settings.musicSection}
      <FeatureSwitchCard {pageState} {features} feature="music-actions">
        <MusicButtons {pageState} />
        <OptionSwitch {pageState} field="musicActions.feedback" checked={settings.musicActions.feedback} label={i18n.message("set_feedback")} />
        {#if quickSaveOnce === "music-actions"}<div class="mt-2"><FeatureDetails {pageState} feature="music-actions" variant="settings" /></div>{/if}
      </FeatureSwitchCard>
      <FeatureSwitchCard {pageState} {features} feature="music-keys">
        {#await keys.ready then}
          <ul class="flex flex-col gap-1.5">
            {#each actions as action (action)}
              {@const title = action === "picker" ? i18n.message("musicButton_picker") : i18n.message(musicActionName[action])}
              <li class="flex items-center justify-between gap-3 text-[13.5px]"><span>{title}</span>
                <KeyRecorder controller={keys.recorder({ kind: "music", action })} text={keyText} {title} showTitle={false} targetName={() => title} os={platform.os} {browser} /></li>
            {/each}
          </ul>
        {/await}
        <OptionSwitch {pageState} field="musicKeys.feedback" checked={settings.musicKeys.feedback} label={i18n.message("set_feedback")} />
        {#if quickSaveOnce === "music-keys"}<div class="mt-2"><FeatureDetails {pageState} feature="music-keys" variant="settings" /></div>{/if}
      </FeatureSwitchCard>
    {/if}
  </div>
{/if}
