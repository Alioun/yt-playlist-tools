<script lang="ts">
  import type { Snippet } from "svelte"
  import { untrack } from "svelte"
  import type { createFeatureCopy, PageFeatureId } from "../onboarding/features"
  import type { PageState } from "../lib/page-state.svelte"
  import { accessSite, heldMessage, heldReason, isOn } from "../lib/held"
  import { healthLine } from "../lib/health"
  import FeatureCard from "./FeatureCard.svelte"

  // A feature card bound to its switch (UI-SET-07, UI-SET-19, UI-POP-32): before consent the switch opens
  // "Before this feature can run"; after it, the change goes to the store with any permission asked in the click.
  let { pageState, features, feature, children }: {
    pageState: PageState
    features: ReturnType<typeof createFeatureCopy>
    feature: PageFeatureId
    children?: Snippet
  } = $props()
  const { i18n, backend } = untrack(() => pageState.page)
  const copy = $derived(features.featureOf(feature))
  const settings = $derived(pageState.settings)
  const access = $derived(pageState.access ?? { www: true, music: true, browserMenu: true })
  const held = $derived(settings ? heldReason(feature, settings, pageState.agreed, access) : null)
  const site = $derived(accessSite(feature))
  const health = $derived(pageState.status?.kind === "status" ? pageState.status.health.find(row => row.feature === feature && row.site === site) : undefined)
  let line = $state<string | null>(null)
  let consenting = $state(false)
  async function change(next: boolean) {
    if (next && !pageState.agreed) { consenting = true; return }
    const answer = await pageState.switchFeature(feature, next)
    line = answer.kind === "refused" ? i18n.message(answer.reason === "sync-full" ? "pop_switchRefused_sync_full" : answer.reason === "update-needed" ? "pop_switchRefused_update_needed"
      : answer.reason === "site-access" ? "pop_switchRefused_site_access" : "pop_switchFailed")
      : feature === "shortcuts" && next && answer.limitedMusic ? i18n.message("access_musicShortcutsDenied") : null
  }
  function giveAccess() {
    const request = held === "browser-menu" ? backend.access.requestCombined({ music: false, browserMenu: true }) : backend.access.request(site)
    void request.then(() => pageState.refreshAccess())
  }
</script>

{#if settings}
  <FeatureCard {feature} name={copy.name} description={copy.description} footprint={copy.footprint} footprintLabel={features.footprintText[copy.footprint]}
    on={isOn(settings, feature)} held={held ? i18n.message(heldMessage[held]) : null} line={line ?? healthLine(i18n, health)}
    action={held === "site-access" || held === "browser-menu" ? { label: i18n.message(held === "browser-menu" ? "held_allow" : "held_giveAccess"), run: giveAccess } : null}
    disabled={!pageState.editable} onswitch={change} {children} />
{/if}
{#if consenting}
  <div class="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-6">
    <div class="w-full max-w-xl">
      {#await import("../popup/ConsentSheet.svelte") then { default: Consent }}
        <Consent {pageState} {feature} name={copy.name} variant="dialog" onclose={() => { consenting = false }} />
      {/await}
    </div>
  </div>
{/if}
