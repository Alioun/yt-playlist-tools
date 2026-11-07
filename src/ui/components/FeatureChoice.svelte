<script lang="ts">
  import { Checkbox } from "bits-ui"
  import type { Snippet } from "svelte"
  import clsx from "clsx"
  import FootprintTag from "./FootprintTag.svelte"
  import Glyph from "./Glyph.svelte"
  import type { Footprint } from "../onboarding/features"

  // A whole-card checkbox. The function binding keeps it controlled: Bits UI shows only what the caller holds.
  let {
    name,
    description,
    footprint,
    footprintLabel,
    checked,
    onchange,
    badge,
    disabled = false,
    preview
  }: {
    name: string
    description: string
    footprint: Footprint
    footprintLabel: string
    checked: boolean
    onchange: (next: boolean) => void
    badge?: string
    disabled?: boolean
    preview?: Snippet
  } = $props()

  const uid = $props.id()
</script>

<Checkbox.Root
  bind:checked={() => checked, (next) => onchange(next)}
  {disabled}
  aria-labelledby="{uid}-name"
  aria-describedby={[badge ? `${uid}-badge` : "", `${uid}-description`, `${uid}-footprint`, preview ? `${uid}-preview` : ""].filter(Boolean).join(" ")}
  class={clsx(
    "group/pick bg-card focus-visible:ring-ring/40 flex w-full items-start gap-3.5 rounded-xl border p-4 text-left transition-[border-color,box-shadow,background-color] duration-150 outline-none focus-visible:ring-3 disabled:opacity-60",
    checked ? "border-primary/55 shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_35%,transparent)]" : "hover:border-foreground/20"
  )}
>
  <span class="min-w-0 flex-1">
    <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span id="{uid}-name" class="text-[15px] leading-6 font-semibold tracking-[-0.005em]">{name}</span>
      {#if badge}
        <span id="{uid}-badge" class="bg-success-soft text-success inline-flex min-h-5 items-center rounded-full px-2 text-[11px] font-semibold">{badge}</span>
      {/if}
    </span>
    <span id="{uid}-description" class="text-muted-foreground mt-0.5 block text-[13.5px] leading-[1.5]">{description}</span>
    <span class="mt-2.5 block"><FootprintTag {footprint} label={footprintLabel} id="{uid}-footprint" /></span>
    {#if preview}<span id="{uid}-preview">{@render preview()}</span>{/if}
  </span>
  <span
    aria-hidden="true"
    class={clsx(
      "mt-1 inline-flex size-[22px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px] transition-colors",
      checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background group-hover/pick:border-foreground/35"
    )}
  >
    {#if checked}<Glyph name="check" class="size-3.5" strokeWidth={3} />{/if}
  </span>
</Checkbox.Root>
