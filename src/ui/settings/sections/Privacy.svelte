<script lang="ts">
  import { untrack } from "svelte"
  import Button from "../../components/Button.svelte"
  import RichText from "../../components/RichText.svelte"
  import Switch from "../../components/Switch.svelte"
  import { clearAllAvailability, clearAllNotice, createClearAllConfirmation } from "../../backend/clear-all"
  import { richParts } from "../../../shared/i18n"
  import type { createFeatureCopy } from "../../onboarding/features"
  import type { PageState } from "../../lib/page-state.svelte"

  // Settings › Privacy & data (UI-SET-16, UI-SET-22).
  let { pageState }: { pageState: PageState; features: ReturnType<typeof createFeatureCopy> } = $props()
  const { i18n, backend } = untrack(() => pageState.page)
  const view = $derived(pageState.ready)
  const device = $derived(view?.device.kind === "current" ? view.device.device : null)
  let withdrawing = $state<"closed" | "confirming" | "pending">("closed")
  let consentLine = $state<string | null>(null)
  let recentFailed = $state(false)
  let fileLine = $state<string | null>(null)
  let importing = $state<{ readonly token: string; readonly accounts: number; readonly file: string } | null>(null)
  let clearLine = $state<string | null>(null)
  let input: HTMLInputElement | undefined = $state()
  const clear = $derived(view ? createClearAllConfirmation(backend, clearAllAvailability({ schema: view.layout === "current" ? 1 : view.layout === "newer-version" ? 2 : undefined,
    device: device ? { syncOn: device.syncOn, id: device.id, consent: device.consent } : undefined, sync: view.sync ?? undefined })) : null)
  let clearState = $state<ReturnType<NonNullable<typeof clear>["state"]>>({ kind: "closed" })
  let alsoSynced = $state(false)

  async function withdraw() {
    if (!device?.consent) return
    withdrawing = "pending"
    const answer = await backend.call("ui.withdraw", { expected: { v: device.consent.v, at: device.consent.at } })
    withdrawing = "closed"
    consentLine = i18n.message(answer.kind === "answered" && answer.result.kind === "withdrawn" ? "consent_withdrawn"
      : answer.kind === "answered" && answer.result.kind === "refused" && answer.result.reason === "unconfirmed" ? "consent_withdrawUnconfirmed" : "consent_withdrawFailed")
  }
  async function recentAdds(value: boolean) {
    recentFailed = false
    const answer = await backend.call("ui.device", { change: { field: "recentAdds", value } })
    recentFailed = !(answer.kind === "answered" && answer.result.kind === "confirmed")
  }
  async function exportFile() {
    fileLine = null
    const answer = await backend.call("ui.exportSettings", {})
    if (answer.kind !== "answered" || answer.result.kind !== "file") { fileLine = i18n.message("set_exportFailed"); return }
    const link = document.createElement("a")
    link.href = URL.createObjectURL(new Blob([answer.result.text], { type: "application/json" }))
    link.download = answer.result.filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }
  async function picked(file: File | undefined) {
    if (!file) return
    fileLine = null
    const answer = await backend.call("ui.importSettings", { action: "prepare", text: await file.text() })
    if (answer.kind === "answered" && answer.result.kind === "confirm") importing = { token: answer.result.token, accounts: answer.result.accounts, file: file.name }
    else fileLine = refusal(answer)
  }
  async function confirmImport() {
    if (!importing) return
    const { token } = importing
    importing = null
    const answer = await backend.call("ui.importSettings", { action: "confirm", token })
    fileLine = answer.kind === "answered" && answer.result.kind === "imported" ? i18n.message("set_imported") : refusal(answer)
  }
  function refusal(answer: Awaited<ReturnType<typeof backend.call<"ui.importSettings">>>) {
    const reason = answer.kind === "answered" && answer.result.kind === "refused" ? answer.result.reason : "failed"
    return i18n.message(reason === "private" ? "set_importPrivate" : reason === "newer-format" ? "set_importNewer" : reason === "invalid-file" ? "set_importInvalid" : "set_importFailed")
  }
  async function step(work: (confirmation: NonNullable<typeof clear>) => Promise<unknown>) {
    if (!clear) return
    const result = await work(clear)
    clearState = clear.state()
    if (clearState.kind === "answered") {
      const answer = clearState.answer
      clearLine = clearAllNotice(answer, i18n) ?? i18n.message(answer.kind === "clear-result" && answer.outcome === "cleared" ? "set_cleared" : "set_clearFailed")
    } else if (clearState.kind === "unconfirmed") clearLine = i18n.message("set_clearFailed")
    return result
  }
</script>

{#if view}
  <div class="flex flex-col gap-4">
    <section class="bg-card flex flex-col gap-2 rounded-2xl border p-5" data-section="consent">
      <h3 class="text-[15px] font-semibold">{i18n.message("set_consentHeading")}</h3>
      {#if device?.consent}
        <p class="text-[13.5px]">{i18n.message("consent_agreedOn", { date: i18n.date(device.consent.at, { dateStyle: "long" }) })}</p>
        <div class="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onclick={() => pageState.page.openFirstRun()}>{i18n.message("consent_readAgain")}</Button>
          <Button size="sm" variant="destructive-soft" onclick={() => { withdrawing = "confirming" }}>{i18n.message("consent_withdraw")}</Button>
        </div>
        {#if withdrawing !== "closed"}
          <div role="alertdialog" aria-labelledby="withdraw-text" class="border-warning-border bg-warning-soft rounded-lg border p-3 text-[13.5px]">
            <p id="withdraw-text"><RichText parts={richParts(i18n.message("consent_withdrawConfirm"))} /></p>
            <div class="mt-2 flex gap-2">
              <Button size="sm" variant="destructive" pending={withdrawing === "pending"} onclick={withdraw}>{i18n.message("consent_withdrawButton")}</Button>
              <Button size="sm" variant="outline" onclick={() => { withdrawing = "closed" }}>{i18n.message("consent_cancel")}</Button>
            </div>
          </div>
        {/if}
      {:else}
        <p class="text-[13.5px]">{i18n.message("set_notAgreed")}</p>
        <Button size="sm" class="self-start" onclick={() => pageState.page.openFirstRun()}>{i18n.message("shell_review")}</Button>
      {/if}
      {#if consentLine}<p role="status" class="text-[13px]">{consentLine}</p>{/if}
    </section>
    <section class="bg-card rounded-2xl border p-5">
      <h3 class="mb-2 text-[15px] font-semibold">{i18n.message("set_keptHeading")}</h3>
      <div class="flex items-start justify-between gap-4 text-[13.5px]">
        <span>{i18n.message("set_recentAdds")}</span>
        <Switch checked={device?.recentAdds ?? true} label={i18n.message("set_recentAdds")} disabled={!pageState.agreed} onchange={recentAdds} />
      </div>
      {#if recentFailed}<p role="status" class="text-destructive text-[12.5px]">{i18n.message("option_failed")}</p>{/if}
    </section>
    <section class="bg-card flex flex-col gap-2 rounded-2xl border p-5">
      <h3 class="text-[15px] font-semibold">{i18n.message("set_fileHeading")}</h3>
      <div><Button size="sm" variant="outline" onclick={exportFile}>{i18n.message("set_export")}</Button>
        <p class="text-muted-foreground mt-1 text-[12.5px]">{i18n.message("set_exportLine")}</p></div>
      <div>
        <Button size="sm" variant="outline" disabled={pageState.private} aria-describedby={pageState.private ? "import-private" : undefined} onclick={() => input?.click()}>{i18n.message("set_import")}</Button>
        {#if pageState.private}<p id="import-private" class="text-muted-foreground mt-1 text-[12.5px]">{i18n.message("set_importPrivate")}</p>{/if}
        <input bind:this={input} type="file" accept="application/json,.json" class="hidden" onchange={event => picked(event.currentTarget.files?.[0])} />
      </div>
      {#if importing}
        <div role="alertdialog" aria-labelledby="import-text" class="border-warning-border bg-warning-soft rounded-lg border p-3 text-[13.5px]">
          <p id="import-text">{i18n.message("set_importConfirm", { file: importing.file, count: i18n.number(importing.accounts) })}</p>
          <div class="mt-2 flex gap-2"><Button size="sm" onclick={confirmImport}>{i18n.message("set_importButton")}</Button>
            <Button size="sm" variant="outline" onclick={() => { importing = null }}>{i18n.message("set_cancel")}</Button></div>
        </div>
      {/if}
      {#if fileLine}<p role="status" class="text-[13px]">{fileLine}</p>{/if}
    </section>
    <section class="bg-card rounded-2xl border p-5">
      <h3 class="mb-1 text-[15px] font-semibold">{i18n.message("set_googleHeading")}</h3>
      <a class="text-primary text-[13.5px] hover:underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">{i18n.message("googleAccess_link")}</a>
    </section>
    {#if clear}
      <section class="bg-card flex flex-col gap-2 rounded-2xl border p-5" data-section="clear-all">
        <h3 class="text-[15px] font-semibold">{i18n.message("set_clearHeading")}</h3>
        {#if clearState.kind === "closed" || clearState.kind === "answered" || clearState.kind === "unconfirmed"}
          <Button size="sm" variant="destructive-soft" class="self-start" onclick={() => { clear.open(); clearState = clear.state(); alsoSynced = false }}>{i18n.message("set_clearButton")}</Button>
        {:else}
          <div role="alertdialog" aria-labelledby="clear-text" class="border-warning-border bg-warning-soft rounded-lg border p-3 text-[13.5px]">
            <p id="clear-text">{clear.text}</p>
            {#if clear.availability.kind !== "unknown" && clear.availability.checkbox}
              <label class="mt-2 flex items-center gap-2"><input type="checkbox" checked={alsoSynced}
                onchange={event => { alsoSynced = event.currentTarget.checked; void step(c => c.select(alsoSynced)) }} />{clear.checkboxText}</label>
            {/if}
            <div class="mt-2 flex gap-2">
              <Button size="sm" variant="destructive" pending={clearState.kind === "submitting" || clearState.kind === "reviewing"}
                onclick={() => step(async c => { if (c.state().kind === "editing") await c.review(); clearState = c.state(); if (c.state().kind === "reviewed") await c.confirm() })}>{clear.button()}</Button>
              <Button size="sm" variant="outline" onclick={() => step(c => c.cancel())}>{clear.cancelText}</Button>
            </div>
          </div>
        {/if}
        {#if clearLine}<p role="status" class="text-[13px]">{clearLine}</p>{/if}
      </section>
    {/if}
  </div>
{/if}
