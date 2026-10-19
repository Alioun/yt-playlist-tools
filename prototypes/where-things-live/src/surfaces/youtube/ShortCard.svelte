<script lang="ts">
  // A card on the home page's Shorts shelf. Quick-save only (with "Shorts shelves too"); no queue button.
  import EllipsisVertical from "@lucide/svelte/icons/ellipsis-vertical";
  import { app, running, healthOf } from "$lib/state.svelte";
  import { thumb, type Video } from "$lib/data";
  import ThumbButtons from "./ThumbButtons.svelte";
  import { yt } from "./yt.svelte";

  let { video }: { video: Video } = $props();

  function oncontextmenu(e: MouseEvent) {
    e.preventDefault();
    const takeOver = running("cardMenu") && healthOf("cardMenu") !== "broken" && !e.shiftKey;
    yt.menu = { kind: takeOver ? "youtube" : "browser", x: e.clientX, y: e.clientY, title: video.title };
  }

  function open(e: MouseEvent) {
    e.preventDefault();
    app.env.ytPage = "shorts";
  }
</script>

<div class="group relative" role="listitem" {oncontextmenu}>
  <div class="relative">
    <a href="#short" class="block aspect-[9/16] overflow-hidden rounded-xl" style={thumb(video.hue)} onclick={open} aria-label={video.title}
    ></a>
    <ThumbButtons {video} short />
  </div>
  <div class="mt-2 flex gap-1">
    <div class="min-w-0 flex-1">
      <p class="line-clamp-2 text-sm font-medium">{video.title}</p>
      <p class="text-xs text-yt-muted">{video.views}</p>
    </div>
    <EllipsisVertical class="size-4 shrink-0" />
  </div>
</div>
