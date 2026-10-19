<script lang="ts">
  import Glyph from "$ui/components/Glyph.svelte";
  // One feature in the popup's switch list: glyph, name, a one-line summary, its status, and its switch. A feature
  // that's on and has per-account choices unfolds on demand (ticket 09); off, it's this single row.
  import type { Snippet } from "svelte";
  import { Switch } from "$ui/components/ui/switch/index.js";
  import FeatureIcon from "$ui/components/FeatureIcon.svelte";
  import { feature } from "$shared/features/registry";
  import type { FeatureId } from "$shared/model/types";
  import { healthLine, heldBy, setFeature, ui } from "$lib/view.svelte";

  let {
    id,
    summary,
    expandable = false,
    expanded = $bindable(false),
    extra,
    children,
    onopen,
  }: {
    id: FeatureId;
    summary?: Snippet;
    expandable?: boolean;
    expanded?: boolean;
    extra?: Snippet;
    children?: Snippet;
    /** Variant B (drill in): opening shows the feature's own page instead of unfolding here. */
    onopen?: () => void;
  } = $props();

  const def = $derived(feature[id]);
  const on = $derived(ui.s.features[id].on);
  const held = $derived(on ? heldBy(id) : null);
  const health = $derived(on ? healthLine(id) : null);
  // Unfolding reads the account's playlists from YouTube, so it waits for consent like everything else.
  const canOpen = $derived(on && expandable && held !== "consent");
  const heldText = { consent: "Waiting for your OK", access: "Needs site access", section: "YouTube Music is off", paused: "" } as const;
</script>

<div class="group/row" data-feature={id}>
  <div class="flex min-h-[54px] items-center gap-3 py-2 pr-3 pl-3">
    <FeatureIcon {id} {on} />
    <button
      type="button"
      class="min-w-0 flex-1 text-left outline-none disabled:cursor-default"
      disabled={!canOpen}
      aria-expanded={canOpen && !onopen ? expanded : undefined}
      aria-haspopup={canOpen && onopen ? "dialog" : undefined}
      onclick={() => (onopen ? onopen() : (expanded = !expanded))}
    >
      <span class="flex items-center gap-1 text-[13px] leading-5 font-medium">
        {def.name}
        {#if canOpen}
          <Glyph name="chevron-right"
            class="text-muted-foreground size-3.5 transition-transform duration-200 {expanded && !onopen ? 'rotate-90' : ''} group-hover/row:text-foreground"
          />
        {/if}
      </span>
      <span class="text-muted-foreground block truncate text-xs leading-[18px]">
        {#if on && held && heldText[held]}
          <span class="text-warning">{heldText[held]}</span>
        {:else if on && summary}
          {@render summary()}
        {:else}
          {def.short}
        {/if}
      </span>
      {#if health}
        <span class="text-warning mt-0.5 flex items-start gap-1 text-xs leading-4">
          <Glyph name="triangle-alert" class="mt-px size-3 shrink-0" />{health}
        </span>
      {/if}
    </button>
    {#if on && extra && held !== "consent"}{@render extra()}{/if}
    <Switch
      checked={on}
      held={!!held}
      aria-label={def.name}
      onCheckedChange={(v) => {
        setFeature(id, v);
        if (!v) expanded = false;
      }}
    />
  </div>
  {#if canOpen && expanded && children && !onopen}
    <div class="pr-3 pb-3 pl-[54px]">
      {@render children()}
    </div>
  {/if}
</div>
