<script lang="ts">
  // PROTOTYPE CHROME: the browser's own permission prompt, simulated (strings from ticket 19 §5). Not product UI.
  import { onMount } from "svelte";
  import { fakePrompt } from "../fake";

  let site = $state(fakePrompt.site);
  onMount(() => {
    const l = () => (site = fakePrompt.site);
    fakePrompt.listeners.add(l);
    return () => fakePrompt.listeners.delete(l);
  });
  const chrome = fakePrompt.browser === "chrome";
</script>

{#if site}
  <div class="fixed inset-0 z-[100] flex items-start justify-center bg-black/25 pt-3" style="font-family: system-ui, sans-serif">
    <div class="w-[340px] rounded-lg border border-black/10 bg-[#f3f3f3] p-4 text-[13px] text-[#1f1f1f] shadow-2xl" role="alertdialog" aria-label="Browser permission prompt">
      <div class="mb-1 text-[10px] font-semibold tracking-wide text-[#777] uppercase">Browser prompt (simulated)</div>
      {#if chrome}
        <p class="font-semibold">"Playlist Pigeon for YouTube™" has requested additional permissions.</p>
        <p class="mt-2">It could:</p>
        <ul class="mt-1 list-disc pl-5"><li>Read and change your data on {site === "music" ? "music.youtube.com" : "www.youtube.com"}</li></ul>
      {:else}
        <p class="font-semibold">Playlist Pigeon for YouTube™ requests additional permissions.</p>
        <p class="mt-2">It wants to:</p>
        <ul class="mt-1 list-disc pl-5"><li>Access your data for sites in the youtube.com domain</li></ul>
      {/if}
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="rounded border border-black/15 bg-white px-3 py-1" onclick={() => fakePrompt.resolve?.(false)}>Deny</button>
        <button type="button" class="rounded bg-[#1a73e8] px-3 py-1 text-white" onclick={() => fakePrompt.resolve?.(true)}>Allow</button>
      </div>
    </div>
  </div>
{/if}
