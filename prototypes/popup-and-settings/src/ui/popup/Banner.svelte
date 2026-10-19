<script lang="ts">
  import Glyph from "$ui/components/Glyph.svelte";
  // The popup's one banner (ticket 09's order, chosen in `notices.ts`). Attention is amber, info slate-blue, done teal;
  // each has its own icon, so tone never rests on colour alone.
  import type { ActionId, Banner } from "$lib/notices";
  import { Button } from "$ui/components/ui/button/index.js";

  let { banner, onaction }: { banner: Banner; onaction: (id: ActionId) => void } = $props();
  const tone = {
    attention: "border-warning-border bg-warning-soft text-warning",
    info: "border-border bg-info-soft text-info",
    done: "border-success/30 bg-success-soft text-success",
  } as const;
</script>

<div class="mx-3 mt-3 flex gap-2.5 rounded-xl border px-3 py-2.5 {tone[banner.tone]}" role="status" data-banner={banner.id}>
  {#if banner.tone === "attention"}<Glyph name="triangle-alert" class="mt-0.5 size-4 shrink-0" />
  {:else if banner.tone === "done"}<Glyph name="circle-check" class="mt-0.5 size-4 shrink-0" />
  {:else}<Glyph name="info" class="mt-0.5 size-4 shrink-0" />{/if}
  <div class="text-foreground min-w-0 flex-1 text-[12.5px] leading-[18px]">
    <p class="font-medium">{banner.title}</p>
    {#if banner.text}<p class="text-foreground/75 mt-0.5">{banner.text}</p>{/if}
    {#if banner.actions.length}
      <div class="mt-2 flex flex-wrap gap-1.5">
        {#each banner.actions as a (a.id)}
          <Button size="sm" variant={a.primary ? "default" : "outline"} onclick={() => onaction(a.id)}>{a.label}</Button>
        {/each}
      </div>
    {/if}
  </div>
</div>
