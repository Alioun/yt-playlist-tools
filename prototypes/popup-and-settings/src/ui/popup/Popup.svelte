<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 15), variant A: "unfold in place" (chosen). The toolbar popup is "this tab, this
  // account, right now" (ticket 09): header › breakage strip › one banner › YouTube | YouTube Music › This video or
  // Playing now › feature rows. The first view paints from one Backend.load(); everything that unfolds loads on
  // demand. Variants B and C (variants/) reuse these pieces with a different shell.
  //
  // The YouTube tab is part of the first view. The YouTube Music tab is its own chunk: main.ts loads it before the
  // first frame when you're on YouTube Music (so that frame is complete), and otherwise only if you switch to it.
  import type { Component } from "svelte";
  import Lazy from "$ui/components/Lazy.svelte";
  import SiteTabs from "./SiteTabs.svelte";
  import Header from "./Header.svelte";
  import Banner from "./Banner.svelte";
  import Strip from "./Strip.svelte";
  import YouTubeTab from "./YouTubeTab.svelte";
  import { banner as pickBanner } from "$lib/notices";
  import { ui } from "$lib/view.svelte";
  import { closePicker, sheet } from "./sheet.svelte";
  import { runBannerAction } from "./actions";
  import { param } from "$lib/params";

  let { MusicTab = null }: { MusicTab?: Component | null } = $props();

  // Preselected by the site you're on, else the last one used (ticket 09).
  let tab = $state<"youtube" | "music">(ui.s.env.activeSite === "music" ? "music" : "youtube");
  let menuOpen = $state(param("open") === "accounts");
  const banner = $derived(pickBanner(tab));
</script>

<div class="bg-background text-foreground relative flex max-h-[600px] min-h-[420px] w-[360px] flex-col overflow-hidden text-[13px]">
  <Header bind:menuOpen />
  <Strip />
  {#if banner}<Banner {banner} onaction={runBannerAction} />{/if}
  <SiteTabs bind:value={tab} here={ui.s.env.activeSite} />
  <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="tabpanel" id="panel-{tab}" aria-labelledby="tab-{tab}">
    {#if tab === "youtube"}
      <YouTubeTab />
    {:else if MusicTab}
      <MusicTab />
    {:else}
      <Lazy load={() => import("./MusicTab.svelte")} />
    {/if}
  </div>

  {#if menuOpen}
    <Lazy load={() => import("./parts/AccountMenu.svelte")} props={{ onclose: () => (menuOpen = false) }} />
  {/if}
  {#if sheet.req}
    <Lazy load={() => import("./parts/PickerSheet.svelte")} props={{ req: sheet.req, onclose: closePicker }} />
  {/if}
  {#if ui.consentAsk}
    <Lazy load={() => import("./parts/ConsentSheet.svelte")} />
  {/if}
</div>
