<script lang="ts">
  // Menus at the pointer: YouTube's ⋮ menu opened by right-click (card menu feature), the browser's own menu
  // otherwise, and the quick-save "Save to…" picker (ask-each-time mode).
  import ListPlus from "@lucide/svelte/icons/list-plus";
  import Clock from "@lucide/svelte/icons/clock";
  import Bookmark from "@lucide/svelte/icons/bookmark";
  import Download from "@lucide/svelte/icons/download";
  import Share2 from "@lucide/svelte/icons/share-2";
  import Ban from "@lucide/svelte/icons/ban";
  import CircleX from "@lucide/svelte/icons/circle-x";
  import { app, saveVideo } from "$lib/state.svelte";
  import { watchVideo } from "$lib/data";
  import PlaylistPicker from "$lib/components/PlaylistPicker.svelte";
  import { yt, chooseQuickSave } from "./yt.svelte";

  const ytItems = [
    { icon: ListPlus, label: "Add to queue" },
    { icon: Clock, label: "Save to Watch later" },
    { icon: Bookmark, label: "Save to playlist" },
    { icon: Download, label: "Download" },
    { icon: Share2, label: "Share" },
    { icon: Ban, label: "Not interested" },
    { icon: CircleX, label: "Don't recommend channel" },
  ];
  const browserItems = ["Open link in new tab", "Open link in new window", "Copy link address", "Save link as…", "Inspect"];

  function close() {
    yt.menu = null;
    yt.picker = null;
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }
</script>

<svelte:window {onkeydown} />

{#if yt.menu || yt.picker}
  <button
    type="button"
    class="fixed inset-0 z-40 cursor-default"
    aria-label="Close menu"
    onclick={close}
    oncontextmenu={(e) => {
      e.preventDefault();
      close();
    }}
  ></button>
{/if}

{#if yt.menu}
  {#if yt.menu.kind === "youtube"}
    <div class="fixed z-50 w-64 rounded-xl bg-[#282828] py-2 text-sm text-yt-text shadow-2xl" style="left: {yt.menu.x}px; top: {yt.menu.y}px">
      <p class="ext-mark mx-2 mb-1 rounded px-2 py-0.5 text-[11px] text-yt-muted">
        YouTube's own ⋮ menu, opened by right-click. Shift+right-click gives the browser's menu.
      </p>
      {#each ytItems as it (it.label)}
        <button type="button" class="flex w-full items-center gap-4 px-4 py-2 text-left hover:bg-white/10" onclick={close}>
          <it.icon class="size-5" />
          {it.label}
        </button>
      {/each}
    </div>
  {:else}
    <div
      class="fixed z-50 w-56 rounded-md border border-neutral-300 bg-white py-1 text-[13px] text-neutral-800 shadow-xl"
      style="left: {yt.menu.x}px; top: {yt.menu.y}px"
    >
      <p class="px-3 pb-1 text-[10px] text-neutral-400">Browser's menu</p>
      {#each browserItems as it (it)}
        <button type="button" class="block w-full px-3 py-1 text-left hover:bg-neutral-100" onclick={close}>{it}</button>
      {/each}
    </div>
  {/if}
{/if}

{#if yt.picker}
  {@const video = yt.picker.video}
  {@const choose = yt.picker.choose}
  <div
    class="ext-mark fixed z-50 w-72 rounded-xl bg-[#282828] p-3 text-yt-text shadow-2xl"
    style="left: {yt.picker.x}px; top: {yt.picker.y}px"
  >
    <p class="text-sm font-medium">Save to…</p>
    <p class="mb-2 text-xs text-yt-muted">
      {choose ? "Your pick also becomes the one-click quick-save playlist." : "Saves this video once. One click still saves to your quick-save playlist."}
    </p>
    <PlaylistPicker
      skin="yt"
      mode="action"
      account={app.env.account}
      membership={video.id === watchVideo.id ? app.watch.inPlaylists : []}
      maxHeight="12rem"
      onpick={(id) => {
        if (choose) chooseQuickSave(video, id);
        else saveVideo(id, video.title, "quickSave");
        close();
      }}
    />
  </div>
{/if}
