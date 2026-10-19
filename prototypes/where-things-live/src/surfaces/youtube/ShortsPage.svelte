<script lang="ts">
  // A YouTube Short. Ours: the watch-page button at the end of YouTube's action column (with "On Shorts too").
  import ThumbsUp from "@lucide/svelte/icons/thumbs-up";
  import ThumbsDown from "@lucide/svelte/icons/thumbs-down";
  import MessageSquare from "@lucide/svelte/icons/message-square";
  import Forward from "@lucide/svelte/icons/forward";
  import Repeat2 from "@lucide/svelte/icons/repeat-2";
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { app, running, healthOf } from "$lib/state.svelte";
  import { shorts, channels, thumb } from "$lib/data";
  import WatchButton from "./WatchButton.svelte";

  const short = shorts[0];
  const ch = channels[short.channel];
  const actions = [
    { icon: ThumbsUp, label: "1.2M" },
    { icon: ThumbsDown, label: "Dislike" },
    { icon: MessageSquare, label: "3.4K" },
    { icon: Forward, label: "Share" },
    { icon: Repeat2, label: "Remix" },
    { icon: Ellipsis, label: "" },
  ];
</script>

<div class="flex justify-center gap-4 py-4 pb-16">
  <div class="relative aspect-[9/16] h-[640px] overflow-hidden rounded-xl" style={thumb(short.hue)}>
    <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-16">
      <p class="mb-2 flex items-center gap-2 text-sm font-medium">
        <span class="size-8 rounded-full" style="background: hsl({short.hue} 40% 35%)"></span>
        {ch.handle ?? ch.title}
        <span class="rounded-full bg-yt-text px-3 py-1 text-xs text-black">Subscribe</span>
      </p>
      <p class="text-sm">{short.title}</p>
      <div class="mt-3 h-0.5 w-full bg-white/30"><div class="h-full bg-red-600" style="width: {app.watch.progress}%"></div></div>
    </div>
  </div>

  <!-- YouTube's own action column, ours last -->
  <div class="flex flex-col justify-end gap-4 pb-2">
    {#each actions as a, i (i)}
      <span class="flex flex-col items-center gap-1 text-xs">
        <span class="flex size-12 items-center justify-center rounded-full bg-yt-raised"><a.icon class="size-6" /></span>
        {a.label}
      </span>
    {/each}
    {#if running("watchButton") && healthOf("watchButton") !== "broken" && app.features.watchButton.onShorts}
      <WatchButton video={short} variant="round" />
    {/if}
  </div>

  <div class="flex flex-col justify-center gap-4">
    <span class="flex size-12 items-center justify-center rounded-full bg-yt-raised"><ChevronUp class="size-6" /></span>
    <span class="flex size-12 items-center justify-center rounded-full bg-yt-raised"><ChevronDown class="size-6" /></span>
  </div>
</div>
