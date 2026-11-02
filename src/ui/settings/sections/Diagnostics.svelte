<script lang="ts">
  import { untrack } from "svelte"
  import Button from "../../components/Button.svelte"
  import Switch from "../../components/Switch.svelte"
  import type { FeatureId, Site } from "../../../shared/contracts/vocabulary"
  import type { createFeatureCopy } from "../../onboarding/features"
  import { firstRunFeatures } from "../../onboarding/features"
  import type { PageState } from "../../lib/page-state.svelte"
  import { accessSite, heldReason, isOn } from "../../lib/held"
  import { featureName } from "../../lib/health"
  import { browserLabel, knownProblems, type ReportFeature } from "../report"
  import { diagnosticsReport } from "../diagnostics"

  // Settings › Diagnostics (UI-SET-17, HEALTH-22): each feature's status per site, the report with Copy, Known
  // problems, Report a problem, the detailed console log and the version.
  let { pageState, features }: { pageState: PageState; features: ReturnType<typeof createFeatureCopy> } = $props()
  const { i18n, backend, platform } = untrack(() => pageState.page)
  const settings = $derived(pageState.settings)
  const device = $derived(pageState.ready?.device.kind === "current" ? pageState.ready.device.device : null)
  const health = $derived(pageState.status?.kind === "status" ? pageState.status.health : [])
  let copied = $state(false)
  let reporting = $state<ReportFeature | null>(null)
  let logFailed = $state(false)
  const rows = $derived(settings ? firstRunFeatures.filter(row => isOn(settings, row.id)).map(row => {
    const site: Site = accessSite(row.id)
    const status = health.find(entry => entry.feature === row.id && entry.site === site)
    const held = heldReason(row.id, settings, pageState.agreed, pageState.access ?? { www: true, music: true, browserMenu: true })
    return { feature: row.id as FeatureId, site, label: held ? i18n.message("diag_held") : status?.state === "not-working" ? i18n.message("diag_notWorking")
      : status?.state === "partly-working" ? i18n.message("diag_partly") : i18n.message("diag_working"), broken: status !== undefined && status.state !== "working" }
  }) : [])
  const report = $derived(pageState.ready ? diagnosticsReport({ view: pageState.ready, version: pageState.page.version, beta: pageState.page.beta,
    browser: browserLabel(navigator.userAgent, platform.browser), os: platform.os, access: pageState.access, health,
    signedIn: pageState.status?.kind === "status" && pageState.status.tab.kind === "site" ? pageState.status.tab.signedIn : null }) : "")
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
      {#each rows as row (row.feature)}
        <li class="flex items-center justify-between gap-3" data-status={row.feature}>
          <span>{featureName(features, row.feature)} <span class="text-muted-foreground">· {i18n.message(row.site === "www" ? "site_www" : "site_music")}</span></span>
          <span class={row.broken ? "text-warning font-medium" : "text-muted-foreground"}>{row.label}
            {#if row.broken}<Button size="sm" variant="link" onclick={() => { reporting = row.feature }}>{i18n.message("diag_report")}</Button>{/if}</span>
        </li>
      {/each}
    </ul>
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
