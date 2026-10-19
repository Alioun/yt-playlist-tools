<script lang="ts">
  // One feature on first run or the upgrade note: a selectable card with its name, one line, and the footprint tag,
  // so someone can pick only "Doesn't change the page" features and keep YouTube as it is (ticket 09).
  import type { Snippet } from "svelte";
  import Check from "@lucide/svelte/icons/check";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import FeatureIcon from "$ui/components/FeatureIcon.svelte";
  import FootprintTag from "$ui/components/FootprintTag.svelte";
  import { feature } from "$shared/features/registry";
  import { blurbs } from "$shared/features/blurbs";
  import type { FeatureId } from "$shared/model/types";

  let {
    id,
    checked,
    onchange,
    badge,
    blurb,
    children,
  }: {
    id: FeatureId | "sync";
    checked: boolean;
    onchange: (checked: boolean) => void;
    /** A small tag after the name, e.g. "From sync". */
    badge?: string;
    /** Replaces the registry's one line (the upgrade note's shortcuts have no Alt+W preset, ticket 19 §2.2). */
    blurb?: string;
    /** Extra lines under the blurb (the upgrade note's carried values). */
    children?: Snippet;
  } = $props();

  const def = $derived(
    id === "sync"
      ? { name: "Settings sync", blurb: "Keeps your settings the same in every browser where you turn it on.", footprint: "none" as const }
      : { ...feature[id], blurb: blurbs[id] },
  );
</script>

<div
  class="bg-card group/pick relative rounded-xl border transition-[border-color,box-shadow,background-color] duration-150
    {checked ? 'border-primary/55 shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_35%,transparent)]' : 'hover:border-foreground/20'}"
>
  <button
    type="button"
    role="checkbox"
    aria-checked={checked}
    class="flex w-full items-start gap-3.5 rounded-xl p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
    onclick={() => onchange(!checked)}
  >
    {#if id === "sync"}
      <span
        class="inline-flex size-[34px] shrink-0 items-center justify-center rounded-[10px] {checked ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground'}"
        aria-hidden="true"><RefreshCw class="size-[18px]" strokeWidth={1.9} /></span
      >
    {:else}
      <FeatureIcon {id} on={checked} size={34} />
    {/if}
    <span class="min-w-0 flex-1">
      <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span class="text-[15px] leading-6 font-semibold tracking-[-0.005em]">{def.name}</span>
        {#if badge}
          <span class="bg-success-soft text-success inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold">{badge}</span>
        {/if}
      </span>
      <span class="text-muted-foreground mt-0.5 block text-[13.5px] leading-[1.5]">{blurb ?? def.blurb}</span>
      <span class="mt-2.5 block"><FootprintTag footprint={def.footprint} /></span>
    </span>
    <span
      class="mt-1 inline-flex size-[22px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px] transition-colors
        {checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background group-hover/pick:border-foreground/35'}"
      aria-hidden="true"
    >
      {#if checked}<Check class="size-3.5" strokeWidth={3} />{/if}
    </span>
  </button>
  {#if children}
    <div class="border-t border-dashed px-4 pt-3 pb-4 pl-[66px]">
      {@render children()}
    </div>
  {/if}
</div>
