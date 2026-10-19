<script lang="ts">
  // YouTube's home: a video grid and a Shorts shelf.
  import House from "@lucide/svelte/icons/house";
  import Clapperboard from "@lucide/svelte/icons/clapperboard";
  import ListVideo from "@lucide/svelte/icons/list-video";
  import CircleUserRound from "@lucide/svelte/icons/circle-user-round";
  import { videos, shorts } from "$lib/data";
  import VideoCard from "./VideoCard.svelte";
  import ShortCard from "./ShortCard.svelte";

  const guide = [
    { icon: House, label: "Home" },
    { icon: Clapperboard, label: "Shorts" },
    { icon: ListVideo, label: "Subscriptions" },
    { icon: CircleUserRound, label: "You" },
  ];
</script>

<div class="flex">
  <nav class="flex w-[72px] shrink-0 flex-col items-center gap-5 pt-2">
    {#each guide as g (g.label)}
      <span class="flex flex-col items-center gap-1 text-[10px]"><g.icon class="size-5" />{g.label}</span>
    {/each}
  </nav>
  <div class="min-w-0 flex-1 px-4 pb-16">
    <div class="mb-5 flex gap-3 text-sm">
      {#each ["All", "Music", "Cooking", "Science", "Live", "Woodworking", "Recently uploaded"] as chip, i (chip)}
        <span class="rounded-lg px-3 py-1 {i === 0 ? 'bg-yt-text text-black' : 'bg-yt-raised'}">{chip}</span>
      {/each}
    </div>
    <div class="grid grid-cols-4 gap-x-4 gap-y-8" role="list">
      {#each videos.slice(0, 8) as v (v.id)}<VideoCard video={v} />{/each}
    </div>

    <h2 class="mt-10 mb-4 flex items-center gap-2 text-xl font-bold"><Clapperboard class="size-6 text-red-500" /> Shorts</h2>
    <div class="grid grid-cols-4 gap-4" role="list">
      {#each shorts as s (s.id)}<ShortCard video={s} />{/each}
    </div>

    <div class="mt-10 grid grid-cols-4 gap-x-4 gap-y-8" role="list">
      {#each videos.slice(8) as v (v.id)}<VideoCard video={v} />{/each}
    </div>
  </div>
</div>
