<script lang="ts">
  // One feature: switch, name, a one-line summary (from storage), its health line, and a "›" that unfolds its
  // per-account body on demand (ticket 24: the first view is just these rows). Collapsed every time the popup opens.
  // Switched off, it's just this row (same as Settings). Switching on goes through switchOn() (ticket 10).
  import type { Snippet } from "svelte";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import CircleX from "@lucide/svelte/icons/circle-x";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { app, blockReason, blockReasonText, switchOn, healthLine, healthOf } from "$lib/state.svelte";
  import { featureById, type FeatureId } from "$lib/ia";
  import { cn } from "$lib/utils";
  import OnDemand from "./OnDemand.svelte";

  let {
    id,
    summary = "",
    aside,
    children,
  }: { id: FeatureId; summary?: string; aside?: Snippet; children?: Snippet } = $props();
  const def = $derived(featureById[id]);
  const reason = $derived(blockReason(id));
  const health = $derived(healthLine(id));
  const on = $derived(app.features[id].on);
  let open = $state(false);
</script>

<div class="border-b py-2.5 last:border-b-0">
  <div class="flex items-start gap-2">
    {#if on && children}
      <button
        type="button"
        class="text-muted-foreground hover:bg-muted -ml-1 rounded p-0.5"
        aria-expanded={open}
        aria-controls="body-{id}"
        aria-label="{open ? 'Hide' : 'Show'} {def.name} details"
        onclick={() => (open = !open)}><ChevronRight class={cn("size-4 transition-transform", open && "rotate-90")} /></button
      >
    {:else}
      <span class="w-4 shrink-0"></span>
    {/if}
    <label class="min-w-0 flex-1 cursor-pointer" for="switch-{id}">
      <span class="block text-sm leading-tight font-medium">{def.name}</span>
      {#if on && summary}
        <span class="text-muted-foreground block text-xs">{summary}</span>
      {/if}
      {#if on && reason}
        <span class="block text-xs text-amber-700 dark:text-amber-400">{blockReasonText[reason]}</span>
      {/if}
      {#if on && health}
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
    {#if on && aside}{@render aside()}{/if}
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
  {#if on && children && open}
    <div id="body-{id}" class="mt-2 pl-5">
      <OnDemand lines={3}>{@render children()}</OnDemand>
    </div>
  {/if}
</div>
