<script lang="ts">
  import "../parts/parts.css";
  // THROWAWAY PROTOTYPE (ticket 15), variant B: "Drill in". The same first view as A, but a row with per-account
  // choices opens the feature's own page, sliding in over the list (back arrow, its switch in the header), instead
  // of unfolding in place. More width for long lists; one more tap and the list is out of sight while you edit.
  import Lazy from "$ui/components/Lazy.svelte";
  import SiteTabs from "../SiteTabs.svelte";
  import Header from "../Header.svelte";
  import Banner from "../Banner.svelte";
  import Strip from "../Strip.svelte";
  import YouTubeTab from "../YouTubeTab.svelte";
  import SubPage from "./SubPage.svelte";
  import { banner as pickBanner } from "$lib/notices";
  import { ui } from "$lib/view.svelte";
  import { closePicker, sheet } from "../sheet.svelte";
  import { runBannerAction } from "../actions";
  import { param } from "$lib/params";
  import type { FeatureId } from "$shared/model/types";

  let tab = $state<"youtube" | "music">(ui.s.env.activeSite === "music" ? "music" : "youtube");
  let menuOpen = $state(false);
  let page = $state<FeatureId | null>((param("open") as FeatureId | null) ?? null);
  const banner = $derived(pickBanner(tab));
  const open = (id: FeatureId) => (page = id);
</script>

<div class="bg-background text-foreground relative flex h-[600px] w-[360px] flex-col overflow-hidden text-[13px]">
  <Header bind:menuOpen />
  <Strip />
  {#if banner}<Banner {banner} onaction={runBannerAction} />{/if}
  <SiteTabs bind:value={tab} here={ui.s.env.activeSite} />
  <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="tabpanel">
    {#if tab === "youtube"}<YouTubeTab onopen={open} />{:else}<Lazy load={() => import("../MusicTab.svelte")} props={{ onopen: open }} />{/if}
  </div>

  {#if page}<SubPage id={page} onback={() => (page = null)} />{/if}
  {#if menuOpen}
    <Lazy load={() => import("../parts/AccountMenu.svelte")} props={{ onclose: () => (menuOpen = false) }} />
  {/if}
  {#if sheet.req}
    <Lazy load={() => import("../parts/PickerSheet.svelte")} props={{ req: sheet.req, onclose: closePicker }} />
  {/if}
  {#if ui.consentAsk}
    <Lazy load={() => import("../parts/ConsentSheet.svelte")} />
  {/if}
</div>
