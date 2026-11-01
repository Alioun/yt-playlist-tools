<script lang="ts">
  import { onDestroy, untrack } from "svelte"
  import Button from "../components/Button.svelte"
  import FootprintTag from "../components/FootprintTag.svelte"
  import Mark from "../components/Mark.svelte"
  import type { UiSnapshot } from "../backend"
  import { createFeatureCopy } from "../onboarding/features"
  import type { ExtensionPage } from "./start"

  let { page, markSrc, kind }: { page: ExtensionPage; markSrc: string; kind: "popup" | "settings" } = $props()
  const { backend, i18n } = untrack(() => page)
  const features = createFeatureCopy(i18n)
  let snapshot = $state<UiSnapshot | null>(null)
  void backend.load().then(value => { snapshot = value })
  onDestroy(backend.watch(event => { snapshot = event.snapshot }))

  const agreed = $derived(snapshot?.kind === "snapshot" && snapshot.device.kind === "current" && snapshot.device.consent === "agreed")
  const waiting = $derived(snapshot?.kind === "snapshot" && !agreed && snapshot.layout !== "newer-version")
  const on = $derived(snapshot?.kind === "snapshot" && snapshot.settings.kind !== "invalid" && snapshot.settings.kind !== "newer-version"
    ? features.firstRunFeatures.filter(feature => snapshot?.kind === "snapshot" && "value" in snapshot.settings && snapshot.settings.value.selected.includes(feature.id))
    : [])
</script>

<main class={kind === "popup" ? "w-[340px] p-4" : "mx-auto max-w-2xl p-8"}>
  <header class="flex items-center gap-3">
    <Mark src={markSrc} size={kind === "popup" ? 32 : 48} />
    <h1 class="text-lg font-semibold">{kind === "popup" ? i18n.message("extShortName") : i18n.message("shell_settingsHeading")}</h1>
    {#if kind === "popup"}
      <Button class="ml-auto" variant="ghost" onclick={page.openSettings}>{i18n.message("shell_settings")}</Button>
    {/if}
  </header>
  {#if snapshot?.kind === "unavailable" || (snapshot?.kind === "snapshot" && snapshot.layout === "newer-version")}
    <p class="text-muted-foreground mt-4 text-sm">{i18n.message("shell_unavailable")}</p>
  {:else if waiting}
    <section class="bg-card mt-4 flex items-center gap-3 rounded-xl border p-4">
      <p class="text-sm font-medium">{i18n.message("shell_waiting")}</p>
      <Button class="ml-auto" onclick={page.openFirstRun}>{i18n.message("shell_review")}</Button>
    </section>
  {:else if agreed}
    <section class="mt-4">
      {#if on.length === 0}
        <p class="text-muted-foreground text-sm">{i18n.message("shell_noFeatures")}</p>
      {:else}
        <ul class="flex flex-col gap-2">
          {#each on as feature (feature.id)}
            <li class="flex items-center gap-2 text-sm"><span class="font-medium">{feature.name}</span><FootprintTag footprint={feature.footprint} label={features.footprintText[feature.footprint]} /></li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</main>
