<script lang="ts">
  import "./parts.css";
  // Switching a feature on before agreeing asks first (store rule, ticket 03; one versioned consent, ticket 19).
  // The same disclosure as first run, headed "Before this feature can run".
  import Disclosure from "$ui/components/Disclosure.svelte";
  import { Button } from "$ui/components/ui/button/index.js";
  import { feature } from "$shared/features/registry";
  import { agreeAndTurnOn, ui } from "$lib/view.svelte";

  const id = $derived(ui.consentAsk?.feature);
</script>

{#if id}
  <div class="absolute inset-x-0 top-[58px] bottom-0 z-30 flex flex-col">
    <div class="bg-foreground/10 absolute inset-0"></div>
    <div class="bg-popover animate-in slide-in-from-bottom-6 fade-in-0 shadow-float relative mt-2 flex min-h-0 flex-1 flex-col rounded-t-2xl border border-b-0 duration-200">
      <div class="px-4 pt-4 pb-2">
        <h2 class="text-[15px] font-semibold">Before this feature can run</h2>
        <p class="text-muted-foreground text-xs">You switched on {feature[id].name}. Agree once and it starts.</p>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        <Disclosure browser={ui.s.env.browser} size="sm" />
      </div>
      <div class="flex gap-2 border-t px-4 py-3">
        <Button variant="ghost" onclick={() => (ui.consentAsk = null)}>Not now</Button>
        <Button class="flex-1" variant="brand" onclick={() => agreeAndTurnOn(id)}>Agree and turn on {feature[id].name}</Button>
      </div>
    </div>
  </div>
{/if}
