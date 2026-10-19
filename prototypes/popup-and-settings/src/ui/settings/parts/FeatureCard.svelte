<script lang="ts">
  // Settings is every feature's home (ticket 09): one card per feature with its glyph, name, footprint tag, one line,
  // its switch and its status. Its options unfold under it only while it's on; off, it's this single row.
  import type { Snippet } from "svelte";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import Hourglass from "@lucide/svelte/icons/hourglass";
  import { Switch } from "$ui/components/ui/switch/index.js";
  import FeatureIcon from "$ui/components/FeatureIcon.svelte";
  import FootprintTag from "$ui/components/FootprintTag.svelte";
  import { feature, type Footprint } from "$shared/features/registry";
  import { blurbs } from "$shared/features/blurbs";
  import type { FeatureId } from "$shared/model/types";
  import { healthLine, heldBy, setFeature, ui } from "$lib/view.svelte";

  let {
    id,
    name,
    blurb,
    footprint,
    on: onProp,
    held: heldProp,
    status: statusProp,
    ontoggle,
    icon,
    note,
    children,
    anchor,
  }: {
    id?: FeatureId;
    name?: string;
    blurb?: string;
    footprint?: Footprint;
    on?: boolean;
    held?: string | null;
    status?: string | null;
    ontoggle?: (on: boolean) => void;
    icon?: Snippet;
    note?: Snippet;
    children?: Snippet;
    anchor?: string;
  } = $props();

  const def = $derived(id ? feature[id] : null);
  const on = $derived(id ? ui.s.features[id].on : !!onProp);
  const heldReason = $derived(id && on ? heldBy(id) : null);
  const heldText = $derived(
    heldProp ??
      (heldReason === "consent"
        ? "Waiting for your OK: nothing runs until you agree."
        : heldReason === "access"
          ? `Needs site access to ${id && feature[id].site === "music" ? "YouTube Music" : "YouTube"}.`
          : heldReason === "section"
            ? "YouTube Music is off, so this doesn't run. Your choices are kept."
            : null),
  );
  const health = $derived(statusProp ?? (id && on ? healthLine(id) : null));
  const broken = $derived(id ? ui.s.health[id]?.status === "broken" : false);
</script>

<section
  id={anchor ?? (id ? `feature-${id}` : undefined)}
  class="bg-card shadow-soft scroll-mt-6 rounded-2xl border transition-shadow duration-500 data-[flash=true]:ring-4 data-[flash=true]:ring-[color-mix(in_oklch,var(--brand-violet)_35%,transparent)]"
>
  <div class="flex items-start gap-4 px-5 py-4">
    {#if icon}{@render icon()}{:else if id}<FeatureIcon {id} {on} size={38} />{/if}
    <div class="min-w-0 flex-1 pt-0.5">
      <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h3 class="text-[15px] leading-6 font-semibold tracking-[-0.005em]">{name ?? def?.name}</h3>
        {#if footprint ?? def?.footprint}<FootprintTag footprint={(footprint ?? def?.footprint)!} />{/if}
      </div>
      <p class="text-muted-foreground mt-0.5 max-w-[60ch] text-[13.5px] leading-5">{blurb ?? (id ? blurbs[id] : "")}</p>
      {#if note}{@render note()}{/if}
      {#if on && heldText}
        <p class="text-warning mt-2 flex items-start gap-1.5 text-[13px] leading-5">
          <Hourglass class="mt-0.5 size-3.5 shrink-0" />{heldText}
        </p>
      {/if}
      {#if health}
        <p class="text-warning mt-2 flex items-start gap-1.5 text-[13px] leading-5">
          {#if broken}<CircleAlert class="mt-0.5 size-3.5 shrink-0" />{:else}<TriangleAlert class="mt-0.5 size-3.5 shrink-0" />{/if}{health}
        </p>
      {/if}
    </div>
    <Switch
      class="mt-1"
      checked={on}
      held={!!(on && (heldText || (id && heldReason === "paused")))}
      aria-label={name ?? def?.name}
      onCheckedChange={(v) => (ontoggle ? ontoggle(v) : id && setFeature(id, v))}
    />
  </div>
  {#if on && children}
    <div class="border-t">
      {@render children()}
    </div>
  {/if}
</section>
