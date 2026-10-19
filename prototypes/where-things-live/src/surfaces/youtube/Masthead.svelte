<script lang="ts">
  // YouTube's own masthead (mock). Nothing here is drawn by the extension.
  import Menu from "@lucide/svelte/icons/menu";
  import Search from "@lucide/svelte/icons/search";
  import Mic from "@lucide/svelte/icons/mic";
  import Video from "@lucide/svelte/icons/video";
  import Bell from "@lucide/svelte/icons/bell";
  import CircleUserRound from "@lucide/svelte/icons/circle-user-round";
  import { app } from "$lib/state.svelte";
  import { accounts } from "$lib/data";

  const acc = $derived(accounts[app.env.account]);
</script>

<div class="sticky top-0 z-20 flex h-14 items-center gap-4 bg-yt-bg px-4">
  <Menu class="size-5 shrink-0" />
  <span class="flex shrink-0 items-center gap-1 font-semibold tracking-tight">
    <span class="flex h-5 w-7 items-center justify-center rounded-md bg-red-600">
      <span class="ml-0.5 size-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-white"></span>
    </span>
    YouTube
  </span>
  <div class="mx-auto flex w-full max-w-xl items-center">
    <div class="flex h-9 flex-1 items-center rounded-l-full border border-white/20 bg-[#121212] px-4 text-sm text-yt-muted">
      Search
    </div>
    <div class="flex h-9 w-14 items-center justify-center rounded-r-full border border-l-0 border-white/20 bg-yt-raised">
      <Search class="size-4" />
    </div>
    <span class="ml-3 flex size-9 items-center justify-center rounded-full bg-yt-raised"><Mic class="size-4" /></span>
  </div>
  {#if app.env.signedIn}
    <Video class="size-5 shrink-0" />
    <Bell class="size-5 shrink-0" />
    <span class="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white {acc.color}"
      >{acc.initial}</span
    >
  {:else}
    <span class="flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-sm text-sky-400">
      <CircleUserRound class="size-5" /> Sign in
    </span>
  {/if}
</div>
