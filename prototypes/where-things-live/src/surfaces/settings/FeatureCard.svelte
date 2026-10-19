<script lang="ts">
  // One feature: a header row (name, one line, footprint tag, switch). Off = just this row.
  // On = its settings unfold below. Switching on without consent asks for it first.
  import type { Snippet } from "svelte";
  import Switch from "./Toggle.svelte";
  import FootprintTag from "$lib/components/FootprintTag.svelte";
  import { featureById, type FeatureId } from "$lib/ia";
  import {
    app,
    blockReason,
    blockReasonText,
    acceptConsent,
    switchOn,
    togglePause,
    healthLine,
    healthOf,
  } from "$lib/state.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { cn } from "$lib/utils";
  import ConsentDialog from "./ConsentDialog.svelte";

  let { id, children }: { id: FeatureId; children?: Snippet } = $props();

  const def = $derived(featureById[id]);
  const on = $derived(app.features[id].on);
  const blocked = $derived(on ? blockReason(id) : null);
  /** Ticket 18: partly working (amber) or not working (error). */
  const health = $derived(healthLine(id));

  let consentOpen = $state(false);

  // On goes through switchOn (asks for site access first when the site needs it, ticket 10). Off is plain.
  function setOn(v: boolean) {
    if (!v) {
      app.features[id].on = false;
      return;
    }
    if (app.consent !== "accepted") {
      consentOpen = true;
      return;
    }
    switchOn(id);
  }
</script>

<div
  id="feature-{id}"
  class={cn("bg-card scroll-mt-16 rounded-xl border transition-colors", on ? "border-border shadow-sm" : "border-dashed")}
>
  <div class="flex items-start gap-4 p-4">
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        <label for="feat-{id}" class="font-medium">{def.name}</label>
        <FootprintTag footprint={def.footprint} />
        {#if !on}<span class="text-muted-foreground text-xs">Off</span>{/if}
      </div>
      <p class="text-muted-foreground mt-0.5 text-sm">{def.blurb}</p>
      {#if blocked}
        <p class="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">On, but not running: {blockReasonText[blocked]}</p>
      {/if}
      {#if on && health}
        <p
          class={cn(
            "mt-1 text-xs font-medium",
            healthOf(id) === "broken" ? "text-destructive" : "text-amber-700 dark:text-amber-400",
          )}
        >
          {health}
        </p>
      {/if}
      {#if id === "autoAdd" && on && app.autoAddPaused}
        <!-- Pausing lives in the popup and the watch-page menu (this session only); Settings only shows it and resumes. -->
        <p class="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          Paused until you resume or restart the browser
          <Button size="xs" variant="outline" onclick={togglePause}>Resume</Button>
        </p>
      {/if}
    </div>
    <Switch id="feat-{id}" class="mt-1" bind:checked={() => on, setOn} />
  </div>
  {#if on && children}
    <div class="space-y-3 border-t px-4 pt-3 pb-4">
      {@render children()}
    </div>
  {/if}
</div>

<ConsentDialog
  bind:open={consentOpen}
  title="Before {def.name} can run"
  agreeLabel="Agree and turn on"
  onagree={() => {
    acceptConsent();
    switchOn(id);
  }}
/>
