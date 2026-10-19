<script lang="ts">
  // Our toasts, bottom-left where YouTube's own appear, in YouTube's style, one at a time.
  // Failures get an error icon and a red edge, never colour alone (ticket 12). Sticky ones (ticket 18's
  // breakage notice) stay until closed; every toast has a ×.
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import X from "@lucide/svelte/icons/x";
  import { app, dismissToast } from "$lib/state.svelte";
  import { cn } from "$lib/utils";

  const mine = $derived(app.toasts.filter((t) => t.site === "youtube"));

  function act(id: number, run?: () => void) {
    run?.();
    dismissToast(id);
  }
</script>

<div class="pointer-events-none absolute bottom-4 left-4 z-40 flex flex-col gap-2">
  {#each mine as t (t.id)}
    <div
      role={t.failed ? "alert" : "status"}
      class={cn(
        "ext-mark pointer-events-auto flex max-w-md items-center gap-3 rounded-lg bg-[#f1f1f1] py-3 pr-2 pl-4 text-sm text-[#0f0f0f] shadow-lg",
        t.failed && "border-l-4 border-red-600",
      )}
    >
      {#if t.failed}<CircleAlert class="size-5 shrink-0 text-red-600" aria-label="Error" />{/if}
      <span class="flex-1">{t.text}</span>
      {#if t.action}
        <button type="button" class="ml-3 shrink-0 font-medium text-[#065fd4] hover:underline" onclick={() => act(t.id, t.onaction)}
          >{t.action}</button
        >
      {/if}
      <button type="button" class="shrink-0 rounded-full p-1 hover:bg-black/10" aria-label="Close" onclick={() => dismissToast(t.id)}
        ><X class="size-4" /></button
      >
    </div>
  {/each}
</div>
