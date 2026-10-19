<script lang="ts">
  // A YouTube video card (home grid, or compact for Up next). Our buttons come from ThumbButtons.
  import Clock from "@lucide/svelte/icons/clock";
  import ListVideo from "@lucide/svelte/icons/list-video";
  import EllipsisVertical from "@lucide/svelte/icons/ellipsis-vertical";
  import { app, running, healthOf } from "$lib/state.svelte";
  import { channels, thumb, type Video } from "$lib/data";
  import ThumbButtons from "./ThumbButtons.svelte";
  import { yt } from "./yt.svelte";
  import { cn } from "$lib/utils";

  let { video, compact = false }: { video: Video; compact?: boolean } = $props();
  const ch = $derived(channels[video.channel]);

  function oncontextmenu(e: MouseEvent) {
    const onChannelLink = !!(e.target as HTMLElement).closest('[data-link="channel"]');
    const takeOver =
      running("cardMenu") &&
      healthOf("cardMenu") !== "broken" &&
      !e.shiftKey &&
      !(onChannelLink && app.features.cardMenu.linksKeepBrowserMenu);
    e.preventDefault();
    yt.menu = { kind: takeOver ? "youtube" : "browser", x: e.clientX, y: e.clientY, title: video.title };
  }
</script>

<div class={cn("group relative", compact ? "flex gap-2" : "flex flex-col gap-3")} role="listitem" {oncontextmenu}>
  <div class={cn("relative shrink-0", compact ? "w-40" : "w-full")}>
    <a
      href="#watch"
      class={cn("block aspect-video overflow-hidden", compact ? "rounded-lg" : "rounded-xl")}
      style={thumb(video.hue)}
      onclick={(e) => e.preventDefault()}
      aria-label={video.title}
    >
      <span class="absolute right-1.5 bottom-1.5 rounded bg-black/80 px-1 text-xs font-medium">{video.duration}</span>
      <!-- YouTube's own hover buttons -->
      <span
        class="absolute top-1.5 right-1.5 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100"
        title="YouTube's own"
      >
        <span class="flex size-7 items-center justify-center rounded bg-black/80"><Clock class="size-4" /></span>
        <span class="flex size-7 items-center justify-center rounded bg-black/80"><ListVideo class="size-4" /></span>
      </span>
    </a>
    <ThumbButtons {video} />
  </div>
  <div class={cn("flex min-w-0 gap-3", compact && "flex-1")}>
    {#if !compact}
      <span class="size-9 shrink-0 rounded-full" style="background: hsl({video.hue} 40% 35%)"></span>
    {/if}
    <div class="min-w-0 flex-1">
      <p class={cn("line-clamp-2 font-medium", compact ? "text-sm" : "text-base leading-snug")}>{video.title}</p>
      <a
        href="#channel"
        data-link="channel"
        class="mt-1 block text-sm text-yt-muted hover:text-yt-text"
        onclick={(e) => e.preventDefault()}>{ch.title}</a
      >
      <p class="text-sm text-yt-muted">{video.views} · {video.age}</p>
    </div>
    <EllipsisVertical class="mt-1 size-5 shrink-0 opacity-0 group-hover:opacity-100" />
  </div>
</div>
