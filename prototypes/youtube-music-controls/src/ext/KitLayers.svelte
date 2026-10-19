<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27, rough dev build). The kit's top-level layers in its one shadow host: the toast
  // (12 px above whichever player bar YouTube Music shows) and the tooltip.
  import ToastLayer from "../kit/ToastLayer.svelte";
  import TooltipLayer from "../kit/TooltipLayer.svelte";
  import { toaster } from "../kit/toaster.svelte";

  let bottom = $state(84);
  function measure() {
    const bar = document.querySelector("ytmusic-player-bar, ytmusic-miniplayer") as HTMLElement | null;
    const r = bar?.getBoundingClientRect();
    let b = r && r.height > 0 && r.top < innerHeight ? Math.round(innerHeight - r.top + 12) : 12;
    // Stack above YouTube Music's own bottom-left surfaces (its toast, its "Install YouTube Music" mealbar promo),
    // which sit in the same spot (found on real music.youtube.com).
    for (const el of document.querySelectorAll<HTMLElement>("ytmusic-mealbar-promo-renderer, tp-yt-paper-toast.paper-toast-open")) {
      const p = el.getBoundingClientRect();
      if (p.height > 0 && p.left < 300 && p.bottom > innerHeight - b - 8) b = Math.max(b, Math.round(innerHeight - p.top + 8));
    }
    bottom = b;
  }
  // Re-measure shortly after showing: when a first song starts, YouTube Music slides its player bar up after the
  // toast appeared (found on real music.youtube.com).
  $effect(() => {
    if (toaster.current?.id === undefined) return;
    measure();
    const t1 = setTimeout(measure, 400);
    const t2 = setTimeout(measure, 1200);
    return () => (clearTimeout(t1), clearTimeout(t2));
  });
</script>

<svelte:window onresize={measure} />
<ToastLayer {bottom} />
<TooltipLayer />
