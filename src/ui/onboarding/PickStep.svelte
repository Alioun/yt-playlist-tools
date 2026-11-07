<script lang="ts">
  import clsx from "clsx"
  import Button from "../components/Button.svelte"
  import FeatureChoice from "../components/FeatureChoice.svelte"
  import FootprintTag from "../components/FootprintTag.svelte"
  import Glyph from "../components/Glyph.svelte"
  import Switch from "../components/Switch.svelte"
  import type { FirstRunText } from "./text"
  import RichText from "../components/RichText.svelte"
  import type { BrowserKind, FeatureGroup } from "./features"
  import type { FirstRunFlow } from "./flow.svelte"

  let { flow, browser, text }: { flow: FirstRunFlow; browser: BrowserKind; text: FirstRunText } = $props()

  const copy = $derived(text.copy.pick)
  const features = $derived(text.features)
  const groups: readonly FeatureGroup[] = ["youtube", "music", "everywhere"]
  const previewComponent = import("./FeaturePreview.svelte")
  const uid = $props.id()
  const n = $derived(flow.picked.length)
</script>

<section aria-labelledby="{uid}-heading">
  <h1 id="{uid}-heading" tabindex="-1" data-step-heading class="text-[30px] leading-tight font-semibold tracking-[-0.022em] outline-none">{copy.heading}</h1>
  <p class="text-muted-foreground mt-2 text-[15px]">{copy.lead}</p>

  <div class={clsx("bg-card mt-7 rounded-xl border p-4", flow.syncOn && "border-primary/40")}>
    <div class="flex items-start gap-3.5">
      <span
        aria-hidden="true"
        class={clsx("inline-flex size-[34px] shrink-0 items-center justify-center rounded-[10px]", flow.syncOn ? "bg-accent text-primary" : "bg-muted text-muted-foreground")}
      >
        <Glyph name="refresh" class={clsx("size-[18px]", flow.lookup === "looking" && "motion-safe:animate-spin")} strokeWidth={1.9} />
      </span>
      <div class="min-w-0 flex-1">
        <p id="{uid}-sync" class="text-[15px] leading-6 font-semibold">{features.syncFeature.name}</p>
        <p id="{uid}-sync-lead" class="text-muted-foreground text-[13.5px] leading-[1.5]">{copy.syncLead}</p>
        <p class="text-muted-foreground mt-1 text-[12.5px]">{features.syncFeature.description(browser)}</p>
        <span class="mt-2.5 block"><FootprintTag footprint={features.syncFeature.footprint} label={features.footprintText[features.syncFeature.footprint]} /></span>
      </div>
      <Switch class="mt-1" checked={flow.syncOn} label={features.syncFeature.name} describedby="{uid}-sync-lead" onchange={(on) => flow.setSync(on)} />
    </div>
    <div aria-live="polite">
      {#if flow.lookup !== "off" && flow.lookup !== "stopped"}
        <div
          role={flow.lookup === "failed" || flow.lookup === "update-needed" ? "alert" : undefined}
          class={clsx(
            "mt-3.5 ml-[48px] flex items-start gap-2 rounded-lg px-3 py-2.5 text-[13px] leading-[1.45]",
            flow.lookup === "found" ? "bg-success-soft" : flow.lookup === "failed" || flow.lookup === "update-needed" ? "bg-warning-soft" : "bg-muted/70"
          )}
        >
          {#if flow.lookup === "looking"}
            <Glyph name="loader" class="text-muted-foreground mt-px size-4 shrink-0 motion-safe:animate-spin" />
            <span>{copy.looking}</span>
          {:else if flow.lookup === "found"}
            <Glyph name="circle-check" class="text-success mt-px size-4 shrink-0" />
            <span><RichText parts={copy.found} /></span>
          {:else if flow.lookup === "not-found"}
            <Glyph name="info" class="text-muted-foreground mt-px size-4 shrink-0" />
            <span>{copy.notFound}</span>
          {:else}
            <Glyph name="circle-alert" class="text-warning mt-px size-4 shrink-0" />
            <span>{flow.lookup === "update-needed" ? copy.updateNeeded : copy.lookupFailed}</span>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  {#each groups as group (group)}
    <h2 class="text-muted-foreground mt-9 text-xs font-semibold tracking-[0.08em] uppercase">{features.groupHeading[group]}</h2>
    {#if group === "youtube"}
      <p class="text-muted-foreground mt-1.5 flex items-center gap-2 text-[13px]"><Glyph name="eye-off" class="size-3.5 shrink-0" />{copy.pageHint}</p>
    {/if}
    <div class="mt-3 grid gap-2.5">
      {#each features.firstRunFeatures.filter((feature) => feature.group === group) as feature (feature.id)}
        <FeatureChoice
          name={feature.name}
          description={feature.description}
          footprint={feature.footprint}
          footprintLabel={features.footprintText[feature.footprint]}
          checked={flow.picked.includes(feature.id)}
          badge={flow.fromSync.includes(feature.id) ? copy.fromSync : undefined}
          onchange={(on) => flow.toggle(feature.id, on)}
        >
          {#snippet preview()}
            {#await previewComponent then { default: FeaturePreview }}<FeaturePreview id={feature.id} example={text.examples.byId[feature.id]} text={text.examples.text} />{/await}
          {/snippet}
        </FeatureChoice>
      {/each}
    </div>
  {/each}

  <div aria-live="polite">
    {#if flow.asksMusicAccess}
      <p class="bg-muted/70 text-muted-foreground mt-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px]"><Glyph name="info" class="size-4 shrink-0" />{copy.musicAccess[browser]}</p>
    {/if}
  </div>

  <div class="sticky bottom-0 z-10 -mx-6 mt-8 px-6 pt-3 pb-5">
    <div class="bg-card/90 shadow-float flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-2xl border py-3 pr-3 pl-5 backdrop-blur-md">
      <p class="text-muted-foreground max-w-[330px] text-[13px] leading-[1.45]">{copy.footer}</p>
      <Button size="lg" onclick={() => flow.continue()}>{copy.continue(n)}<Glyph name="arrow-right" /></Button>
    </div>
  </div>
</section>
