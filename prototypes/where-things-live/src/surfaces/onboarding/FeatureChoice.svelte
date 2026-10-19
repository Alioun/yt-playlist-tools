<script lang="ts">
  // One selectable feature card for first run and the upgrade note.
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import FootprintTag from "$lib/components/FootprintTag.svelte";
  import { featureById, type FeatureId } from "$lib/ia";
  import { cn } from "$lib/utils";
  import type { Snippet } from "svelte";

  let {
    id,
    checked = $bindable(false),
    tag = null,
    children,
  }: {
    id: FeatureId;
    checked?: boolean;
    tag?: "kept" | "new" | "sync" | null;
    /** Extra detail under the blurb (e.g. what was carried over). */
    children?: Snippet;
  } = $props();

  const f = $derived(featureById[id]);
  const inputId = $derived(`choice-${id}`);
</script>

<div
  class={cn(
    "flex gap-3 rounded-lg border p-3 transition-colors",
    checked ? "border-primary/60 bg-primary/5" : "hover:bg-accent/50",
  )}
>
  <Checkbox id={inputId} bind:checked class="mt-0.5" />
  <div class="min-w-0 flex-1">
    <label for={inputId} class="flex cursor-pointer flex-wrap items-center gap-2">
      <span class="font-medium">{f.name}</span>
      {#if tag === "kept"}<Badge variant="secondary">Kept from 1.4.5</Badge>{/if}
      {#if tag === "new"}<Badge variant="outline">New</Badge>{/if}
      {#if tag === "sync"}<Badge variant="secondary">From sync</Badge>{/if}
    </label>
    <p class="text-muted-foreground mt-0.5 text-sm">{f.blurb}</p>
    <FootprintTag footprint={f.footprint} class="mt-1.5" />
    {#if children}<div class="mt-2 text-sm">{@render children()}</div>{/if}
  </div>
</div>
