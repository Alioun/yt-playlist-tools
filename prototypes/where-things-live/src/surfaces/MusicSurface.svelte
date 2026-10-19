<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 09). Mock YouTube Music: where the quick actions appear (ticket 26's placements).
  // Toggle things on the right: with the YouTube Music switch off, nothing of ours is on the page.
  import { onMount } from "svelte";
  import BrowserFrame from "$lib/components/BrowserFrame.svelte";
  import { app, maybeBreakageNotice } from "$lib/state.svelte";
  import { cn } from "$lib/utils";
  import Chrome from "./music/Chrome.svelte";
  import HomePage from "./music/HomePage.svelte";
  import AlbumPage from "./music/AlbumPage.svelte";
  import PlayingPage from "./music/PlayingPage.svelte";
  import PlayerBar from "./music/PlayerBar.svelte";
  import Toasts from "./music/Toasts.svelte";
  import Picker from "./music/Picker.svelte";
  import ControlPanel from "./music/ControlPanel.svelte";
  import { ui, closePicker, type MusicPage } from "./music/store.svelte";

  // Looking at a YouTube Music tab makes it the active tab.
  if (app.env.activeSite !== "music") {
    app.env.activeSite = "music";
    app.env.musicOpen = true;
  }

  // Ticket 18: the breakage notice shows once per session when a broken feature would act on this page.
  onMount(() => maybeBreakageNotice("music"));

  const pages: { id: MusicPage; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "album", label: "Album" },
    { id: "playing", label: "Now playing" },
  ];

  function pick(id: MusicPage) {
    ui.page = id;
    app.env.activeSite = "music";
    closePicker();
  }

  const url = $derived(
    ui.page === "home"
      ? "music.youtube.com"
      : ui.page === "album"
        ? "music.youtube.com/playlist?list=OLAK5uy_smallfires"
        : `music.youtube.com/watch?v=${app.music.nowPlaying}`,
  );

  const chip = (on: boolean) =>
    cn("rounded-full border px-3 py-1 text-xs", on ? "border-zinc-900 bg-zinc-900 text-white" : "border-neutral-300 bg-white hover:bg-neutral-50");
</script>

<div class="space-y-3 p-6 pb-20">
  <div class="flex flex-wrap items-center gap-1">
    <span class="mr-2 text-xs font-semibold text-neutral-500">Page</span>
    {#each pages as p (p.id)}
      <button type="button" class={chip(ui.page === p.id)} onclick={() => pick(p.id)}>{p.label}</button>
    {/each}
    <span class="mr-2 ml-5 text-xs font-semibold text-neutral-500">Player</span>
    <button type="button" class={chip(ui.playerBar)} onclick={() => (ui.playerBar = true)}>Classic bar</button>
    <button type="button" class={chip(!ui.playerBar)} onclick={() => (ui.playerBar = false)}>New layout (no bar)</button>
    <span class="ml-3 text-xs text-neutral-500">The {app.env.installedApp ? "app's title-bar" : "toolbar"} icon opens the popup.</span>
  </div>

  <div class="flex items-start gap-5">
    <BrowserFrame
      {url}
      title="YouTube Music"
      variant={app.env.installedApp ? "app" : "browser"}
      bind:popupOpen={app.popupOpen}
      class="h-[760px] min-w-0 flex-1"
    >
      <div bind:this={ui.pageEl} class="bg-ytm-bg text-yt-text absolute inset-0 flex flex-col overflow-hidden font-[Roboto,Arial,sans-serif]">
        <Chrome>
          {#if ui.page === "home"}<HomePage />
          {:else if ui.page === "album"}<AlbumPage />
          {:else}<PlayingPage />{/if}
        </Chrome>
        {#if ui.playerBar}<PlayerBar />{/if}
        <Toasts />
        <Picker />
      </div>
    </BrowserFrame>
    <ControlPanel />
  </div>
</div>
