<script lang="ts">
  // YouTube's own miniplayer (mock). Nothing of ours is drawn in it; auto-add keeps counting (ticket 07)
  // and its status is in the popup.
  import X from "@lucide/svelte/icons/x";
  import Play from "@lucide/svelte/icons/play";
  import { app } from "$lib/state.svelte";
  import { channels, watchVideo, thumb } from "$lib/data";
</script>

<div class="absolute right-4 bottom-4 z-30 w-[400px] overflow-hidden rounded-xl bg-yt-raised text-yt-text shadow-2xl">
  <div class="relative aspect-video" style={thumb(watchVideo.hue)}>
    <span class="absolute inset-0 flex items-center justify-center"><Play class="size-8 opacity-80" /></span>
    <button type="button" class="absolute top-2 right-2 rounded-full bg-black/50 p-1" aria-label="Close miniplayer" onclick={() => (app.env.miniplayer = false)}
      ><X class="size-4" /></button
    >
    <div class="absolute inset-x-0 bottom-0 h-1 bg-white/30"><div class="h-full bg-red-600" style="width: {app.watch.progress}%"></div></div>
  </div>
  <div class="px-3 py-2">
    <p class="truncate text-sm font-medium">{watchVideo.title}</p>
    <p class="text-xs text-yt-muted">{channels[watchVideo.channel].title}</p>
  </div>
</div>
