<script lang="ts">
  import "./parts.css";
  // Quick-save, unfolded in the popup: this account's quick-save playlist (ticket 12). Unset means choose mode: the
  // first save asks, and that pick sticks. Later ▾ picks are one-offs; only this choice or the picker's pin change it.
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Clock from "@lucide/svelte/icons/clock";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import { accountInView, act, labelOf, setupOf, titleOf, ui } from "$lib/view.svelte";
  import { openPicker } from "../sheet.svelte";

  let { site = "youtube" }: { site?: "youtube" | "music" } = $props();
  const acct = $derived(accountInView());
  const target = $derived(setupOf(acct)?.[site === "music" ? "musicQuickSave" : "quickSave"] ?? null);

  function choose() {
    if (!acct) return;
    openPicker({
      mode: "choose",
      site,
      acct,
      title: "Quick-save playlist",
      subtitle: `For ${labelOf(acct).name}. One click on a thumbnail saves here.`,
      selected: target,
      purpose: site === "music" ? "musicQuickSave" : "quickSave",
      onchoose: (playlist) => act({ kind: "quickSave", acct, site, playlist }),
    });
  }
</script>

<div class="space-y-2">
  <button
    type="button"
    class="bg-muted/40 hover:bg-muted flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left disabled:opacity-60"
    disabled={!acct}
    onclick={choose}
  >
    {#if target === "WL"}
      <span class="bg-accent inline-flex size-7 shrink-0 items-center justify-center rounded-md"><Clock class="text-primary size-3.5" /></span>
    {:else}
      <span class="bg-accent inline-flex size-7 shrink-0 items-center justify-center rounded-md"><Sparkles class="text-primary size-3.5" /></span>
    {/if}
    <span class="min-w-0 flex-1 leading-tight">
      <span class="text-muted-foreground block text-[11px]">One click saves to</span>
      <span class="block truncate text-[13px] font-medium">{target ? titleOf(target) : "Ask the first time"}</span>
    </span>
    {#if target && ui.s.marks[target]}
      <span class="bg-destructive-soft text-destructive rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold">{ui.s.marks[target] === "full" ? "Full" : "Missing"}</span>
    {/if}
    <ChevronRight class="text-muted-foreground size-4" />
  </button>
  {#if target && acct}
    <button type="button" class="text-muted-foreground hover:text-foreground text-[11.5px] hover:underline" onclick={() => act({ kind: "quickSave", acct, site, playlist: null })}
      >Ask the first time instead</button
    >
  {/if}
  <p class="text-muted-foreground text-[11.5px] leading-4">The ▾ beside the button picks another playlist for one save.</p>
</div>
