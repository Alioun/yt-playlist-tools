<script lang="ts">
  // One feature: name, one-line summary and its switch. Switched off, it's just this row (same as Settings).
  // Switching on goes through switchOn(), which asks for site access first when the site needs it (ticket 10).
  import type { Snippet } from "svelte";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import CircleX from "@lucide/svelte/icons/circle-x";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import { app, blockReason, blockReasonText, switchOn, healthLine, healthOf } from "$lib/state.svelte";
  import { featureById, type FeatureId } from "$lib/ia";

  let {
    id,
    summary = "",
    aside,
    children,
  }: { id: FeatureId; summary?: string; aside?: Snippet; children?: Snippet } = $props();
  const def = $derived(featureById[id]);
  const reason = $derived(blockReason(id));
  const health = $derived(healthLine(id));
</script>

<div class="border-b py-2.5 last:border-b-0">
  <div class="flex items-start gap-3">
    <label class="min-w-0 flex-1 cursor-pointer" for="switch-{id}">
      <span class="block text-sm leading-tight font-medium">{def.name}</span>
      {#if app.features[id].on && summary}
        <span class="text-muted-foreground block text-xs">{summary}</span>
      {/if}
      {#if app.features[id].on && reason}
        <span class="block text-xs text-amber-700 dark:text-amber-400">{blockReasonText[reason]}</span>
      {/if}
      {#if app.features[id].on && health}
        <!-- Ticket 18: icon plus words, never colour alone. -->
        <span
          class="mt-0.5 flex items-start gap-1 text-xs {healthOf(id) === 'broken'
            ? 'text-destructive'
            : 'text-amber-700 dark:text-amber-400'}"
        >
          {#if healthOf(id) === "broken"}<CircleX class="mt-0.5 size-3 shrink-0" />{:else}<TriangleAlert
              class="mt-0.5 size-3 shrink-0"
            />{/if}
          {health}
        </span>
      {/if}
    </label>
    {#if app.features[id].on && aside}{@render aside()}{/if}
    <Switch
      id="switch-{id}"
      bind:checked={
        () => app.features[id].on,
        (v) => {
          if (v) switchOn(id);
          else app.features[id].on = false;
        }
      }
      aria-label={def.name}
      class="mt-0.5"
    />
  </div>
  {#if app.features[id].on && children}
    <div class="mt-2">{@render children()}</div>
  {/if}
</div>
