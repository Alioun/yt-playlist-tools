<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 09). Mock YouTube pages showing where each feature's in-page controls appear.
  // Toggle features on the right: switched-off features leave nothing on the page.
  import { untrack } from "svelte";
  import BrowserFrame from "$lib/components/BrowserFrame.svelte";
  import { app, maybeBreakageNotice, type YtPage } from "$lib/state.svelte";
  import { watchVideo, shorts } from "$lib/data";
  import Masthead from "./youtube/Masthead.svelte";
  import HomePage from "./youtube/HomePage.svelte";
  import WatchPage from "./youtube/WatchPage.svelte";
  import ShortsPage from "./youtube/ShortsPage.svelte";
  import Overlays from "./youtube/Overlays.svelte";
  import Toasts from "./youtube/Toasts.svelte";
  import ControlPanel from "./youtube/ControlPanel.svelte";
  import Miniplayer from "./youtube/Miniplayer.svelte";
  import { yt } from "./youtube/yt.svelte";
  import { cn } from "$lib/utils";

  // Looking at a YouTube tab: make it the active tab (scenarios like "no tab" would otherwise contradict the page).
  if (app.env.activeSite !== "youtube") {
    app.env.activeSite = "youtube";
    app.env.youtubeOpen = true;
  }

  // Ticket 18: a feature that isn't working shows its notice once, when it would act: on page load and navigation.
  $effect(() => {
    app.env.ytPage;
    app.scenario;
    untrack(() => maybeBreakageNotice("youtube"));
  });

  const pages: { id: YtPage; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "watch", label: "Watch" },
    { id: "shorts", label: "Shorts" },
  ];

  function pick(id: YtPage) {
    app.env.ytPage = id;
    app.env.activeSite = "youtube";
    yt.menu = null;
    yt.picker = null;
  }

  const frame = $derived(
    app.env.ytPage === "home"
      ? { url: "www.youtube.com", title: "YouTube" }
      : app.env.ytPage === "watch"
        ? { url: `www.youtube.com/watch?v=${watchVideo.id}`, title: `${watchVideo.title} - YouTube` }
        : { url: `www.youtube.com/shorts/${shorts[0].id}`, title: `${shorts[0].title} - YouTube` },
  );

  let scroller: HTMLDivElement | undefined = $state();
  function onscroll() {
    yt.picker = null;
  }
</script>

<div class="space-y-3 p-6 pb-20">
  <div class="flex items-center gap-1">
    <span class="mr-2 text-xs font-semibold text-neutral-500">Page</span>
    {#each pages as p (p.id)}
      <button
        type="button"
        class={cn(
          "rounded-full border px-3 py-1 text-xs",
          app.env.ytPage === p.id ? "border-zinc-900 bg-zinc-900 text-white" : "border-neutral-300 bg-white hover:bg-neutral-50",
        )}
        onclick={() => pick(p.id)}>{p.label}</button
      >
    {/each}
    <span class="ml-3 text-xs text-neutral-500">The toolbar icon opens the popup over this page.</span>
  </div>

  <div class="flex items-start gap-5">
    <BrowserFrame url={frame.url} title={frame.title} bind:popupOpen={app.popupOpen} class="h-[760px] min-w-0 flex-1">
      <div bind:this={scroller} {onscroll} class="absolute inset-0 overflow-y-auto bg-yt-bg font-[Roboto,Arial,sans-serif] text-yt-text">
        <Masthead />
        {#if app.env.ytPage === "home"}<HomePage />
        {:else if app.env.ytPage === "watch"}<WatchPage />
        {:else}<ShortsPage />{/if}
      </div>
      {#if app.env.ytPage === "home" && app.env.miniplayer}<Miniplayer />{/if}
      <Toasts />
      <Overlays />
    </BrowserFrame>
    <ControlPanel />
  </div>
</div>
