<script lang="ts">
  import clsx from "clsx"
  import { untrack } from "svelte"
  import Button from "../components/Button.svelte"
  import Modal from "../components/Modal.svelte"
  import type { FeatureId } from "../../shared/contracts/vocabulary"
  import type { createFeatureCopy } from "../onboarding/features"
  import { firstRunFeatures } from "../onboarding/features"
  import type { PageState } from "../lib/page-state.svelte"
  import { featureName } from "../lib/health"
  import { browserLabel, knownProblems, reportAddress, type ReportFeature, type ReportKind } from "./report"

  // Report a problem (UI-SET-21, HEALTH-27, REL-STORE-37): a kind, a feature, and exactly what the address carries.
  let { pageState, features, feature = "other", report = null, onclose }: {
    pageState: PageState
    features: ReturnType<typeof createFeatureCopy>
    feature?: ReportFeature
    report?: string | null
    onclose: () => void
  } = $props()
  const { i18n, platform, version: built, beta } = untrack(() => pageState.page)
  const health = $derived(pageState.status?.kind === "status" ? pageState.status.health : [])
  let chosen = $state<ReportFeature>(untrack(() => feature))
  const initialBroken = untrack(() => health.some(row => row.feature === feature && row.state !== "working"))
  let kind = $state<ReportKind>(initialBroken ? "not-working" : "problem")
  let copied = $state(false)
  const uid = $props.id()
  const browser = browserLabel(navigator.userAgent, platform.browser)
  const version = `${built}${beta ? " (beta)" : ""}`
  const special = { upgrade: "report_upgrade", pages: "report_pages", other: "report_other" } as const
  const name = $derived(chosen in special ? i18n.message(special[chosen as keyof typeof special]) : featureName(features, chosen as FeatureId))
  const status = $derived.by(() => {
    const row = health.find(entry => entry.feature === chosen)
    return row?.state === "not-working" ? "Not working" : row?.state === "partly-working" ? `Partly working${row.gaps[0] ? `: ${row.gaps[0]}` : ""}` : "Working"
  })
  const values = $derived([version, browser, name, ...kind === "idea" ? [] : [status]].join(" · "))
  const kinds = [["not-working", "report_broken", "report_brokenLine"], ["problem", "report_wrong", "report_wrongLine"], ["idea", "report_idea", "report_ideaLine"]] as const
  const options: readonly ReportFeature[] = [...firstRunFeatures.map(row => row.id), "sync", "upgrade", "pages", "other"]
  async function copy() {
    if (!report) return
    await navigator.clipboard.writeText(report)
    copied = true
  }
  function open() {
    pageState.page.open(reportAddress({ kind, version, browser, feature: name, status }))
    onclose()
  }
</script>

<div class="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-6">
  <Modal {onclose} labelledby="report-title" class="bg-card fixed inset-0 m-auto flex max-h-[90vh] w-[min(32rem,calc(100vw-3rem))] flex-col gap-3 overflow-y-auto rounded-2xl p-6 shadow-xl">
    <h2 id="report-title" class="text-lg font-semibold">{i18n.message("report_title")}</h2>
    <p class="text-muted-foreground text-[13.5px]">{i18n.message("report_lead")}</p>
    <div role="radiogroup" aria-labelledby="report-title" class="flex flex-col gap-2">
      {#each kinds as [value, title, line] (value)}
        <label class={clsx("focus-within:ring-ring/40 cursor-pointer rounded-xl border p-3 text-left focus-within:ring-3", kind === value ? "border-primary ring-primary/30 ring-2" : "hover:border-foreground/20")}>
          <input class="sr-only" type="radio" name="{uid}-kind" {value} checked={kind === value} onchange={() => { kind = value }} />
          <span class="block text-[14px] font-medium">{i18n.message(title)}</span>
          <span class="text-muted-foreground block text-[12.5px]">{i18n.message(line)}</span>
        </label>
      {/each}
    </div>
    <label class="flex flex-col gap-1 text-[13.5px]"><span class="font-medium">{i18n.message("report_feature")}</span>
      <select class="border-input bg-background h-9 rounded-md border px-2" value={chosen} onchange={event => { chosen = event.currentTarget.value as ReportFeature }}>
        {#each options as option (option)}<option value={option}>{option in special ? i18n.message(special[option as keyof typeof special]) : featureName(features, option as FeatureId)}</option>{/each}
      </select>
    </label>
    <p class="text-[13px]" data-report-values>{i18n.message("report_opensWith", { values })}</p>
    {#if kind !== "idea" && report}
      <div><Button size="sm" variant="outline" onclick={copy}>{i18n.message("report_copy")}</Button>
        <p class="text-muted-foreground mt-1 text-[12.5px]">{copied ? i18n.message("diag_copied") : i18n.message("report_copyLine")}</p></div>
    {/if}
    <p class="text-muted-foreground text-[12.5px]">{i18n.message("report_noAccount")}</p>
    <div class="flex flex-wrap items-center gap-2">
      <a class="text-primary text-[13px] hover:underline" href={knownProblems} target="_blank" rel="noreferrer">{i18n.message("diag_known")}</a>
      <span class="flex-1"></span>
      <Button variant="outline" onclick={onclose}>{i18n.message("report_cancel")}</Button>
      <Button onclick={open}>{i18n.message("report_open")}</Button>
    </div>
  </Modal>
</div>
