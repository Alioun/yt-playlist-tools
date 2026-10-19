<script lang="ts">
  // YouTube's watch page. Ours: the watch-page button after Save and …, and the thumbnail buttons on Up next.
  import ThumbsUp from "@lucide/svelte/icons/thumbs-up";
  import ThumbsDown from "@lucide/svelte/icons/thumbs-down";
  import Share2 from "@lucide/svelte/icons/share-2";
  import Bookmark from "@lucide/svelte/icons/bookmark";
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import Play from "@lucide/svelte/icons/play";
  import { app, running, healthOf } from "$lib/state.svelte";
  import { videos, channels, watchVideo, thumb } from "$lib/data";
  import VideoCard from "./VideoCard.svelte";
  import WatchButton from "./WatchButton.svelte";

  const ch = channels[watchVideo.channel];
  // 18:42 long; the time label follows the simulated playhead.
  const total = 18 * 60 + 42;
  const time = $derived.by(() => {
    const s = Math.round((app.watch.progress / 100) * total);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} / 18:42`;
  });
  const upNext = videos.filter((v) => v.id !== watchVideo.id).slice(0, 8);
  const pill = "flex h-9 items-center gap-2 rounded-full bg-yt-raised px-3 text-sm font-medium";
</script>

<div class="flex gap-6 px-6 pt-4 pb-16">
  <div class="min-w-0 flex-1">
    <div class="relative aspect-video overflow-hidden rounded-xl" style={thumb(watchVideo.hue)}>
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="flex size-16 items-center justify-center rounded-full bg-black/50"><Play class="size-8" /></span>
      </div>
      <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pt-6 pb-2">
        <div class="h-1 w-full bg-white/30">
          <div class="h-full bg-red-600" style="width: {app.watch.progress}%"></div>
        </div>
        <p class="mt-1.5 text-xs">{time}</p>
      </div>
    </div>

    <h1 class="mt-3 text-xl font-bold">{watchVideo.title}</h1>

    <div class="mt-3 flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-3">
        <span class="size-10 rounded-full" style="background: hsl({watchVideo.hue} 40% 35%)"></span>
        <div class="mr-2">
          <p class="font-medium">{ch.title}</p>
          <p class="text-xs text-yt-muted">1.2M subscribers</p>
        </div>
        <span class="rounded-full bg-yt-text px-4 py-2 text-sm font-medium text-black">Subscribe</span>
      </div>
      <!-- YouTube's own action row; ours goes last, after Save and … -->
      <div class="ml-auto flex items-center gap-2">
        <span class="flex h-9 items-center rounded-full bg-yt-raised text-sm font-medium">
          <span class="flex items-center gap-2 border-r border-white/20 px-3"><ThumbsUp class="size-5" /> 12K</span>
          <span class="px-3"><ThumbsDown class="size-5" /></span>
        </span>
        <span class={pill}><Share2 class="size-5" /> Share</span>
        <span class={pill}><Bookmark class="size-5" /> Save</span>
        <span class="flex size-9 items-center justify-center rounded-full bg-yt-raised"><Ellipsis class="size-5" /></span>
        {#if running("watchButton") && healthOf("watchButton") !== "broken"}
          <WatchButton video={watchVideo} />
        {/if}
      </div>
    </div>

    <div class="mt-4 rounded-xl bg-yt-raised p-3 text-sm">
      <p class="font-medium">{watchVideo.views} · {watchVideo.age}</p>
      <p class="mt-1 text-yt-muted">
        A walk through what a UI compiler emits: how components become small update functions, and why that keeps pages light.
        Chapters, links and sources below.
      </p>
    </div>

    <p class="mt-6 text-lg font-bold">1,024 Comments</p>
    <div class="mt-3 flex items-center gap-3 text-sm text-yt-muted">
      <span class="size-9 rounded-full bg-yt-raised"></span>
      <span class="flex-1 border-b border-white/20 pb-1">Add a comment…</span>
    </div>
  </div>

  <aside class="w-[360px] shrink-0">
    <div class="mb-3 flex gap-2 text-sm">
      {#each ["All", `From ${ch.title}`, "Related"] as chip, i (chip)}
        <span class="rounded-lg px-3 py-1 {i === 0 ? 'bg-yt-text text-black' : 'bg-yt-raised'}">{chip}</span>
      {/each}
    </div>
    <div class="flex flex-col gap-3" role="list">
      {#each upNext as v (v.id)}<VideoCard video={v} compact />{/each}
    </div>
  </aside>
</div>
