<script lang="ts">
  // Our toast, made to look like YouTube Music's: bottom-left, one at a time (ticket 26).
  // Failures get an error icon and a red edge, never colour alone. Every toast has a ×; ticket 18's
  // breakage notice is sticky and stays until dismissed; its "Details" runs t.onaction.
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import X from "@lucide/svelte/icons/x";
  import { app, dismissToast } from "$lib/state.svelte";
  import { cn } from "$lib/utils";
  import { runAction } from "./actions";
  import { ui } from "./store.svelte";

  const mine = $derived(app.toasts.filter((t) => t.site === "music"));
</script>

{#each mine as t (t.id)}
  <div
    role={t.failed ? "alert" : "status"}
    class={cn(
      "ext-mark absolute left-4 z-30 flex max-w-md items-center gap-3 rounded bg-[#212121] py-3 pr-2 pl-4 text-sm text-white shadow-lg",
      ui.playerBar ? "bottom-20" : "bottom-4",
      t.failed && "border-l-4 border-red-500 pl-3",
    )}
  >
    {#if t.failed}<CircleAlert class="size-5 shrink-0 text-red-400" aria-label="Error" />{/if}
    <span class="flex-1">{t.text}</span>
    {#if t.action}
      <button type="button" class="ml-3 font-medium text-sky-300 uppercase hover:text-sky-200" onclick={() => runAction(t.id)}
        >{t.action}</button
      >
    {/if}
    <button type="button" class="rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Dismiss" onclick={() => dismissToast(t.id)}
      ><X class="size-4" /></button
    >
  </div>
{/each}
