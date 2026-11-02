<script lang="ts">
  import { onDestroy, untrack } from "svelte"
  import Button from "../../components/Button.svelte"
  import PercentField from "../../components/PercentField.svelte"
  import KeyRecorder from "../../keys/KeyRecorder.svelte"
  import { createKeySettingsClient } from "../../keys/client"
  import { keyRecorderText } from "../../keys/text"
  import FeatureDetails from "../../features/FeatureDetails.svelte"
  import type { createFeatureCopy } from "../../onboarding/features"
  import type { PageState } from "../../lib/page-state.svelte"
  import FeatureSwitchCard from "../FeatureSwitchCard.svelte"
  import OptionSwitch from "../OptionSwitch.svelte"
  import { GatherRow } from "../../lib/gather.svelte"

  // Settings › YouTube (UI-SET-10).
  let { pageState, features }: { pageState: PageState; features: ReturnType<typeof createFeatureCopy> } = $props()
  const { i18n, backend, platform } = untrack(() => pageState.page)
  const settings = $derived(pageState.settings)
  const keyText = keyRecorderText(i18n)
  const keys = createKeySettingsClient({ backend, platform, commands: untrack(() => pageState.page.commands), text: keyText, chooser: { open: async () => {} } })
  // "Last gather: …", with Undo while it's offered (UI-SET-24).
  const gatherRow = new GatherRow(untrack(() => pageState.page))
  onDestroy(() => { keys.dispose(); gatherRow.dispose() })
  const gatherOn = $derived(settings?.gather.on === true && pageState.agreed)
  $effect(() => { if (gatherOn) untrack(() => { void gatherRow.refresh() }) })
  let pctFailed = $state(false)
  async function defaultPct(value: number) {
    pctFailed = false
    const answer = await backend.change({ kind: "default-percentage", value })
    pctFailed = answer.kind !== "confirmed"
  }
  async function resume() {
    await backend.call("ui.pause", { paused: false })
    await pageState.refreshStatus()
  }
  const browser = platform.browser === "firefox" ? "Firefox" : "Chrome"
</script>

{#if settings}
  <div class="flex flex-col gap-4">
    <FeatureSwitchCard {pageState} {features} feature="auto-add">
      {#if pageState.paused}
        <p class="mb-3 text-[13.5px]">{i18n.message("summary_autoAdd_paused")} <Button size="sm" variant="link" onclick={resume}>{i18n.message("pop_resume")}</Button></p>
      {/if}
      {#if pageState.acct}<h4 class="mb-2 text-[13.5px] font-medium">{i18n.message("set_thisAccount", { account: pageState.accountName() })}</h4>{/if}
      <FeatureDetails {pageState} feature="auto-add" variant="settings" />
      <h4 class="mt-4 mb-2 text-[13.5px] font-medium">{i18n.message("set_forEveryAccount")}</h4>
      <PercentField value={settings.autoAdd.pct} label={i18n.message("set_defaultPct")} start={i18n.message("autoAdd_goal_start")} full={i18n.message("autoAdd_goal_full")} onsave={defaultPct} />
      {#if pctFailed}<p role="status" class="text-destructive text-[12.5px]">{i18n.message("option_failed")}</p>{/if}
      <OptionSwitch {pageState} field="autoAdd.feedback" checked={settings.autoAdd.feedback} label={i18n.message("set_feedback")} />
      <OptionSwitch {pageState} field="autoAdd.toolbarTick" checked={settings.autoAdd.toolbarTick} label={i18n.message("set_tick")} />
      <OptionSwitch {pageState} field="autoAdd.toolbarPaused" checked={settings.autoAdd.toolbarPaused} label={i18n.message("set_pausedMark")} note={i18n.message("set_pausedMarkNote")} />
    </FeatureSwitchCard>
    <FeatureSwitchCard {pageState} {features} feature="shortcuts">
      <FeatureDetails {pageState} feature="shortcuts" variant="settings" />
      <div class="mt-3 flex flex-col gap-1">
        {#await keys.ready then}
          <div class="flex items-center justify-between gap-3 text-[13.5px]"><span>{i18n.message("shortcuts_pickerKey")}</span>
            <KeyRecorder controller={keys.recorder({ kind: "picker" })} text={keyText} title={i18n.message("shortcuts_pickerKey")} showTitle={false} targetName={() => i18n.message("shortcuts_pickerKey")} os={platform.os} {browser} /></div>
        {/await}
        <OptionSwitch {pageState} field="shortcuts.feedback" checked={settings.shortcuts.feedback} label={i18n.message("set_feedback")} />
        <p class="text-muted-foreground text-[12.5px]">{i18n.message("shortcuts_whereKeysWork")}</p>
      </div>
    </FeatureSwitchCard>
    <FeatureSwitchCard {pageState} {features} feature="quick-save">
      <FeatureDetails {pageState} feature="quick-save" variant="settings" />
      <OptionSwitch {pageState} field="quickSave.shortsShelves" checked={settings.quickSave.shortsShelves} label={i18n.message("set_qsShorts")} />
      <OptionSwitch {pageState} field="quickSave.feedback" checked={settings.quickSave.feedback} label={i18n.message("set_feedback")} />
    </FeatureSwitchCard>
    <FeatureSwitchCard {pageState} {features} feature="queue-button">
      <OptionSwitch {pageState} field="queueButton.feedback" checked={settings.queueButton.feedback} label={i18n.message("set_feedback")} />
    </FeatureSwitchCard>
    <FeatureSwitchCard {pageState} {features} feature="watch-button">
      <OptionSwitch {pageState} field="watchButton.shorts" checked={settings.watchButton.shorts} label={i18n.message("set_wbShorts")} />
      <OptionSwitch {pageState} field="watchButton.feedback" checked={settings.watchButton.feedback} label={i18n.message("set_feedback")} note={i18n.message("set_wbFeedbackNote")} />
    </FeatureSwitchCard>
    <FeatureSwitchCard {pageState} {features} feature="card-menu">
      <OptionSwitch {pageState} field="cardMenu.keepLinkMenu" checked={settings.cardMenu.keepLinkMenu} label={i18n.message("set_cmLinks")} />
    </FeatureSwitchCard>
    <FeatureSwitchCard {pageState} {features} feature="browser-menu">
      <p class="text-muted-foreground mb-1 text-[12.5px]">{i18n.message("set_bmLine")}</p>
      <OptionSwitch {pageState} field="browserMenu.feedback" checked={settings.browserMenu.feedback} label={i18n.message("set_feedback")} />
    </FeatureSwitchCard>
    <FeatureSwitchCard {pageState} {features} feature="gather">
      <FeatureDetails {pageState} feature="gather" variant="settings" />
      <OptionSwitch {pageState} field="gather.feedback" checked={settings.gather.feedback} label={i18n.message("set_feedback")} note={i18n.message("set_gatherFeedbackNote")} />
      {#if gatherOn && gatherRow.line}
        {@const action = gatherRow.line.action}
        <p class="mt-2 text-[12.5px]" role="status" data-gather-line>{gatherRow.line.text}
          {#if action?.kind === "undo"}<Button size="sm" variant="link" disabled={gatherRow.running} onclick={() => gatherRow.undo(action.id)}>{i18n.message("toast_action_undo")}</Button>{/if}</p>
      {/if}
      <p class="text-muted-foreground mt-2 text-[12.5px]">{i18n.message("set_gatherKeys")}</p>
      <a class="text-primary mt-1 block text-[12.5px] hover:underline" href="https://github.com/karimelgazar/gathertube" target="_blank" rel="noreferrer">{i18n.message("set_gatherCredit")}</a>
    </FeatureSwitchCard>
  </div>
{/if}
