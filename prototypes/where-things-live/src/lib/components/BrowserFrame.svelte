<script lang="ts">
  // A low-fi browser window around a page, with the extension's toolbar icon.
  // Clicking the icon opens the real popup component over the page, as in a browser.
  import type { Snippet } from "svelte";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import RotateCw from "@lucide/svelte/icons/rotate-cw";
  import Puzzle from "@lucide/svelte/icons/puzzle";
  import EllipsisVertical from "@lucide/svelte/icons/ellipsis-vertical";
  import VenetianMask from "@lucide/svelte/icons/venetian-mask";
  import ExtIcon from "./ExtIcon.svelte";
  import Popup from "../../surfaces/popup/Popup.svelte";
  import { app, toolbarBadge, extThemeClass } from "$lib/state.svelte";
  import { cn } from "$lib/utils";

  let {
    url,
    title,
    children,
    variant = "browser",
    popupOpen = $bindable(false),
    class: className = "",
  }: {
    url: string;
    title: string;
    children: Snippet;
    /** "app" = the installed YouTube Music app window (extensions sit in its title bar). */
    variant?: "browser" | "app";
    popupOpen?: boolean;
    class?: string;
  } = $props();
</script>

<div class={cn("flex flex-col overflow-hidden rounded-xl border border-neutral-300 bg-neutral-200 shadow-xl", className)}>
  {#if variant === "browser"}
    <div class="flex items-end gap-2 px-3 pt-2">
      <span class="mb-2 flex gap-1.5">
        <span class="size-3 rounded-full bg-red-400"></span><span class="size-3 rounded-full bg-amber-400"></span><span
          class="size-3 rounded-full bg-green-400"
        ></span>
      </span>
      <div class="flex max-w-72 items-center gap-2 truncate rounded-t-lg bg-neutral-50 px-3 py-1.5 text-xs text-neutral-700">
        <span class="size-3 shrink-0 rounded-sm bg-neutral-400"></span>
        <span class="truncate">{title}</span>
      </div>
    </div>
    <div class="flex items-center gap-2 bg-neutral-50 px-3 py-1.5 text-neutral-600">
      <ArrowLeft class="size-4" /><ArrowRight class="size-4 opacity-40" /><RotateCw class="size-4" />
      <div class="flex-1 truncate rounded-full bg-neutral-200/70 px-3 py-1 text-xs">{url}</div>
      {#if app.env.privateWindow}
        <span class="flex items-center gap-1 rounded-full bg-purple-700 px-2 py-0.5 text-[11px] text-white"
          ><VenetianMask class="size-3" /> Private</span
        >
      {/if}
      <button
        type="button"
        class="rounded-md p-1 hover:bg-neutral-200"
        title="Playlist Tools (toolbar icon)"
        onclick={() => (popupOpen = !popupOpen)}
      >
        <ExtIcon badge={toolbarBadge()} />
      </button>
      <Puzzle class="size-4" />
      <EllipsisVertical class="size-4" />
    </div>
  {:else}
    <div class="flex items-center gap-2 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300">
      <span class="size-3 rounded-full bg-red-600"></span>
      <span class="flex-1">YouTube Music (installed app)</span>
      <button
        type="button"
        class="rounded-md p-1 hover:bg-neutral-700"
        title="Playlist Tools (in the app's title bar)"
        onclick={() => (popupOpen = !popupOpen)}
      >
        <ExtIcon badge={toolbarBadge()} />
      </button>
      <EllipsisVertical class="size-4" />
    </div>
  {/if}
  <div class="relative min-h-0 flex-1">
    {@render children()}
    {#if popupOpen}
      <div class={cn("absolute top-1 right-2 z-50", extThemeClass())}>
        <Popup />
      </div>
    {/if}
  </div>
</div>
