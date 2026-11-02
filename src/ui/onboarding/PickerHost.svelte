<script lang="ts">
  import { onDestroy, untrack } from "svelte"
  import Button from "../components/Button.svelte"
  import { PickerPanel, createPickerText, type PickerEvent } from "../picker"
  import { PickerModel } from "../../shared/picker/model.svelte"
  import type { HostRequest } from "./picker-host"
  import AutoAddDetails from "../features/AutoAddDetails.svelte"
  import { pickerSource } from "../features/source"
  import type { PageState } from "../lib/page-state.svelte"

  // First run's playlist picker (UI-ONB-05, UI-PICK-19): choose mode saves one destination itself; auto-add's list
  // saves each tick itself and closes with Done.
  let { pageState, request, onclose }: { pageState: PageState; request: HostRequest; onclose: (saved: boolean) => void } = $props()
  const { i18n, platform } = untrack(() => pageState.page)
  const text = createPickerText(i18n)
  const asked = untrack(() => request)
  const source = asked.kind === "choose" ? pickerSource(pageState, asked.acct, asked.site, { kind: "destination", destination: asked.destination }) : null
  const picker = source && asked.kind === "choose" ? new PickerModel({ source, site: asked.site, mode: "choose" }) : null
  onDestroy(() => { picker?.close(); source?.dispose() })
  function outcome(event: PickerEvent) {
    if (event.kind === "tick" && (event.outcome.kind === "changed" || event.outcome.kind === "picked")) onclose(true)
    if (event.kind === "create" && event.outcome.kind === "created") onclose(true)
  }
</script>

<div class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6" role="presentation">
  <div role="dialog" aria-modal="true" aria-label={i18n.message("picker_listLabel")} class="bg-card flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl shadow-xl">
    {#if picker && asked.kind === "choose"}
      <PickerPanel {picker} {text} purpose={asked.purpose} platform={platform.os} onoutcome={outcome} onrequestclose={() => onclose(false)} />
    {:else if asked.kind === "manage"}
      <div class="flex flex-col gap-3 overflow-y-auto p-5">
        <AutoAddDetails {pageState} acct={asked.acct} variant="settings" />
        <Button class="self-end" onclick={() => onclose(true)}>{i18n.message("firstRun_finish_done")}</Button>
      </div>
    {/if}
  </div>
</div>
