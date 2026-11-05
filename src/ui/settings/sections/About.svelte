<script lang="ts">
  import { untrack } from "svelte"
  import Button from "../../components/Button.svelte"
  import Mark from "../../components/Mark.svelte"
  import type { createFeatureCopy } from "../../onboarding/features"
  import type { PageState } from "../../lib/page-state.svelte"

  // Settings › About (UI-SET-18, UI-BRAND-02).
  let { pageState, features, markSrc }: { pageState: PageState; features: ReturnType<typeof createFeatureCopy>; markSrc: string } = $props()
  const { i18n } = untrack(() => pageState.page)
  let reporting = $state(false)
  const [before, after] = i18n.message("about_credit", { link: "\u0000" }).split("\u0000")
</script>

<section class="bg-card flex flex-col items-start gap-2 rounded-2xl border p-6">
  <Mark src={markSrc} size={48} />
  <h2 class="text-xl font-semibold">{i18n.message("about_name")}</h2>
  <p class="text-muted-foreground text-[13.5px]">{i18n.message("diag_version", { version: pageState.page.version })} · {i18n.message("about_formerly")}</p>
  <Button size="sm" variant="outline" class="mt-2" onclick={() => { reporting = true }}>{i18n.message("diag_report")}</Button>
  <p class="text-muted-foreground mt-3 text-[12.5px]">{i18n.message("about_attribution")} {i18n.message("about_notAffiliated")}</p>
  <p class="text-muted-foreground text-[12.5px]">{before}<a class="text-primary hover:underline" href="https://github.com/karimelgazar/gathertube" target="_blank" rel="noreferrer">GatherTube</a>{after}</p>
</section>
{#if reporting}
  {#await import("../ReportDialog.svelte") then { default: Report }}
    <Report {pageState} {features} onclose={() => { reporting = false }} />
  {/await}
{/if}
