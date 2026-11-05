<script lang="ts">
  import clsx from "clsx"
  import type { Snippet } from "svelte"
  import Button from "../components/Button.svelte"
  import FootprintTag from "../components/FootprintTag.svelte"
  import Glyph from "../components/Glyph.svelte"
  import Switch from "../components/Switch.svelte"
  import { featureGlyph } from "../components/glyphs"
  import type { FeatureId } from "../../shared/contracts/vocabulary"
  import type { Footprint } from "../onboarding/features"

  // A Settings feature card (UI-SET-07): glyph, name, footprint tag, description, switch, and a held or health
  // line. Its options show only while it's on.
  let { feature, name, description, footprint, footprintLabel, on, held = null, line = null, action = null, disabled = false, onswitch, children }: {
    feature: FeatureId
    name: string
    description: string
    footprint: Footprint
    footprintLabel: string
    on: boolean
    held?: string | null
    line?: string | null
    action?: { readonly label: string; readonly run: () => void } | null
    disabled?: boolean
    onswitch: (next: boolean) => void
    children?: Snippet
  } = $props()
  const uid = $props.id()
</script>

<section id="feature-{feature}" data-feature-card={feature} aria-labelledby="{uid}-name" class={clsx("bg-card scroll-mt-28 rounded-2xl border p-4 transition-shadow sm:p-5 md:scroll-mt-20")}>
  <div class="flex items-start gap-3.5">
    <span aria-hidden="true" class={clsx("inline-flex size-9 shrink-0 items-center justify-center rounded-xl", on ? "bg-accent text-primary" : "bg-muted text-muted-foreground")}>
      <Glyph name={featureGlyph[feature]} class="size-[18px]" />
    </span>
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        <h3 id="{uid}-name" class="text-[15px] font-semibold">{name}</h3>
        <FootprintTag {footprint} label={footprintLabel} />
      </div>
      <p class="text-muted-foreground mt-1 text-[13.5px] leading-relaxed">{description}</p>
      {#if held}<p id="{uid}-held" class="text-warning mt-1.5 text-[13px]">{held}</p>{/if}
      {#if line}<p class="text-warning mt-1.5 text-[13px]" role="status">{line}</p>{/if}
      {#if action}<Button size="sm" variant="outline" class="mt-2" onclick={action.run}>{action.label}</Button>{/if}
    </div>
    <Switch checked={on} held={held !== null} label={name} describedby={held ? `${uid}-held` : undefined} {disabled} onchange={onswitch} />
  </div>
  {#if on && children}<div class="mt-4 border-t pt-4 sm:pl-[50px]">{@render children()}</div>{/if}
</section>
