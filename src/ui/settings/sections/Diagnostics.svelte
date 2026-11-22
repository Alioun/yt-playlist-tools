<script lang="ts">
  import { untrack } from "svelte"
  import Button from "../../components/Button.svelte"
  import Switch from "../../components/Switch.svelte"
  import type { createFeatureCopy } from "../../onboarding/features"
  import type { PageState } from "../../lib/page-state.svelte"
  import { heldMessage } from "../../lib/held"
  import { featureName, healthLine } from "../../lib/health"
  import { browserLabel, knownProblems, type ReportFeature } from "../report"
  import { diagnosticsReport, statusRows, type RowState } from "../diagnostics"
  import type { UiCheck, UiDiagnostics } from "../../../shared/contracts/ui-pages"

  // Settings › Diagnostics (UI-SET-17, HEALTH-22): each feature's status per site, the report with Copy, Known
  // problems, Report a problem, the detailed console log and the version.
  let { pageState, features }: { pageState: PageState; features: ReturnType<typeof createFeatureCopy> } = $props()
  const { i18n, backend, platform } = untrack(() => pageState.page)
  const device = $derived(pageState.ready?.device.kind === "current" ? pageState.ready.device.device : null)
  let copied = $state(false)
  let reporting = $state<ReportFeature | null>(null)
  let logFailed = $state(false)
  const rows = $derived(statusRows(pageState))
  const untabbed = $derived((["www", "music"] as const).filter(site => rows.some(row => row.site === site && row.state.kind === "no-tab")))
  const stateLabels = { working: "diag_working", "partly-working": "diag_partly", "not-working": "diag_notWorking" } as const
  const label = (state: RowState) => i18n.message(state.kind === "held" ? heldMessage[state.held] : state.kind === "no-tab" ? "diag_noTab" : stateLabels[state.health.state])
  const broken = (state: RowState) => state.kind === "health" && state.health.state !== "working"
  const checkedKeys = {
    www: { one: "diag_checked_www_one", other: "diag_checked_www_other" },
    music: { one: "diag_checked_music_one", other: "diag_checked_music_other" }
  } as const
  const checkedLine = (check: UiCheck) =>
    i18n.message(checkedKeys[check.site][i18n.plural(check.jobs.length)], { done: i18n.number(check.jobs.filter(job => job.ok).length), total: i18n.number(check.jobs.length) })
  let evidence = $state<Extract<UiDiagnostics, { kind: "diagnostics" }> | null>(null)
  let checked = $state.raw<readonly UiCheck[] | null>(null)
  const checks = $derived(checked ?? evidence?.checks ?? [])
  const report = $derived(pageState.ready ? diagnosticsReport({ view: pageState.ready, version: pageState.page.version, beta: pageState.page.beta,
    browser: browserLabel(navigator.userAgent, platform.browser), os: platform.os, access: pageState.access, rows,
    signedIn: pageState.tab ? pageState.signedIn : null, evidence: evidence && { checks, signals: evidence.signals } }) : "")
  // HEALTH-22, HEALTH-23: the session's signals feed the report, and Check now runs only when clicked.
  let checking = $state(false), checkFailed = $state(false), reads = 0
  async function refreshEvidence() {
    const read = ++reads
    const answer = await backend.call("ui.diagnostics", { check: false })
    if (read === reads && answer.kind === "answered" && answer.result.kind === "diagnostics") evidence = answer.result
  }
  // The evidence is read again with every status, so which tabs are open and the signals keep up with the rows.
  $effect(() => {
    void pageState.status
    untrack(() => void refreshEvidence())
  })
  async function checkNow() {
    checking = true; checkFailed = false
    try {
      const answer = await backend.call("ui.diagnostics", { check: true })
      if (answer.kind !== "answered" || answer.result.kind !== "diagnostics") {
        checkFailed = true
        return
      }
      ++reads
      evidence = answer.result
      checked = answer.result.checks
      await pageState.refreshStatus()
    } finally { checking = false }
  }
  const noTab = $derived(evidence !== null && !evidence.tabs.www && !evidence.tabs.music)
  async function copy() { await navigator.clipboard.writeText(report); copied = true }
  async function log(value: boolean) {
    logFailed = false
    const answer = await backend.call("ui.device", { change: { field: "detailedLog", value } })
    logFailed = !(answer.kind === "answered" && answer.result.kind === "confirmed")
  }
</script>

<div class="flex flex-col gap-4">
  <section class="bg-card rounded-2xl border p-5">
    <h3 class="mb-2 text-[15px] font-semibold">{i18n.message("diag_statusHeading")}</h3>
    {#if rows.length === 0}<p class="text-muted-foreground text-[13.5px]">{i18n.message("shell_noFeatures")}</p>{/if}
    <ul class="flex flex-col gap-1.5 text-[13.5px]">
      {#each rows as row (`${row.feature}:${row.site}`)}
        {@const why = row.state.kind === "health" ? healthLine(i18n, row.state.health) : null}
        <li data-status={row.feature} data-site={row.site}>
          <div class="flex items-center justify-between gap-3">
            <span>{featureName(features, row.feature)} <span class="text-muted-foreground">· {i18n.message(row.site === "www" ? "site_www" : "site_music")}</span></span>
            <span class={broken(row.state) ? "text-warning font-medium" : "text-muted-foreground"}>{label(row.state)}
              {#if broken(row.state)}<Button size="sm" variant="link" onclick={() => { reporting = row.feature }}>{i18n.message("diag_report")}</Button>{/if}</span>
          </div>
          {#if why}<p class="text-muted-foreground text-[12.5px]">{why}</p>{/if}
        </li>
      {/each}
    </ul>
    {#each untabbed as site (site)}
      <p class="text-muted-foreground mt-2 text-[12.5px]">{i18n.message(site === "www" ? "diag_noTabLine_www" : "diag_noTabLine_music")}</p>
    {/each}
    <div class="mt-3 flex flex-col items-start gap-1.5 border-t pt-3 text-[13.5px]">
      {#if noTab}
        <p class="text-muted-foreground">{i18n.message("diag_checkNoTab")}</p>
        <Button size="sm" variant="outline" onclick={() => pageState.page.open("https://www.youtube.com/")}>{i18n.message("diag_openYouTube")}</Button>
      {:else}
        <Button size="sm" variant="outline" pending={checking} disabled={!pageState.agreed || evidence === null} onclick={checkNow}>{i18n.message("diag_checkNow")}</Button>
        <p class="text-muted-foreground text-[12.5px]">{i18n.message("diag_checkLine")}</p>
      {/if}
      <!-- Each check's lines are new nodes, so a screen reader hears a repeat check with the same counts too. -->
      <div role="status" class="flex flex-col gap-1.5">
        {#if checkFailed}
          <p class="text-destructive text-[12.5px]">{i18n.message("diag_checkFailed")}</p>
        {:else}
          {#each checks as check (`${check.site}:${check.at}`)}
            <p data-check={check.site}>{checkedLine(check)}</p>
          {/each}
        {/if}
      </div>
    </div>
  </section>
  <section class="bg-card rounded-2xl border p-5">
    <div class="mb-2 flex items-center justify-between gap-3">
      <h3 class="text-[15px] font-semibold">{i18n.message("diag_reportHeading")}</h3>
      <Button size="sm" variant="outline" onclick={copy}>{copied ? i18n.message("diag_copied") : i18n.message("diag_copy")}</Button>
    </div>
    <pre class="bg-muted overflow-x-auto rounded-lg p-3 font-mono text-[12px] leading-relaxed" data-report>{report}</pre>
    <div class="mt-3 flex flex-wrap gap-3 text-[13.5px]">
      <a class="text-primary hover:underline" href={knownProblems} target="_blank" rel="noreferrer">{i18n.message("diag_known")}</a>
      <Button size="sm" variant="outline" onclick={() => { reporting = "other" }}>{i18n.message("diag_report")}</Button>
    </div>
  </section>
  <section class="bg-card flex flex-col gap-2 rounded-2xl border p-5">
    <div class="flex items-start justify-between gap-4 text-[13.5px]">
      <span>{i18n.message("diag_detailedLog")}<span class="text-muted-foreground block text-[12.5px]">{i18n.message("diag_detailedLogLine")}</span></span>
      <Switch checked={device?.detailedLog ?? false} label={i18n.message("diag_detailedLog")} disabled={!pageState.agreed} onchange={log} />
    </div>
    {#if logFailed}<p role="status" class="text-destructive text-[12.5px]">{i18n.message("option_failed")}</p>{/if}
    <p class="text-[13.5px]">{i18n.message("diag_version", { version: pageState.page.version })}{pageState.page.beta ? ` ${i18n.message("diag_beta")}` : ""}
      <span class="text-muted-foreground">· {i18n.message("diag_updates")}</span></p>
  </section>
</div>
{#if reporting}
  {#await import("../ReportDialog.svelte") then { default: Report }}
    <Report {pageState} {features} feature={reporting} {report} onclose={() => { reporting = null }} />
  {/await}
{/if}
