<script lang="ts">
  // A mock browser window (tab + address bar) around one of the extension's own pages, which open in a tab.
  // The page renders at 1280 × 800 and scales down to fit the space. Prototype chrome, neutral greys.
  import PigeonMark from "$ui/components/PigeonMark.svelte";
  let {
    src,
    page,
    tabTitle,
    theme,
    browser,
    width = 1280,
    height = 800,
  }: { src: string; page: string; tabTitle: string; theme: "light" | "dark"; browser: "chrome" | "firefox"; width?: number; height?: number } = $props();

  const dark = $derived(theme === "dark");
  let box = $state<HTMLDivElement | null>(null);
  let avail = $state(width);
  $effect(() => {
    if (!box) return;
    const ro = new ResizeObserver(([e]) => (avail = e.contentRect.width));
    ro.observe(box);
    return () => ro.disconnect();
  });
  const scale = $derived(Math.min(1, avail / width));
  const scheme = $derived(browser === "firefox" ? "moz-extension://0c3f…a91e" : "chrome-extension://hkpd…gmle");
</script>

<div bind:this={box} class="w-full min-w-0">
  <div class="mx-auto overflow-hidden rounded-xl border shadow-[0_18px_48px_-16px_rgb(0_0_0/0.35)] {dark ? 'border-white/10' : 'border-black/10'}" style="width:{width * scale}px">
    <div class="{dark ? 'bg-[#202124] text-white/85' : 'bg-[#dee1e6] text-black/80'}">
      <div class="flex h-9 items-end gap-1 px-2 pt-1.5">
        <div class="flex h-full max-w-[300px] min-w-0 items-center gap-2 rounded-t-lg px-3 text-[12px] {dark ? 'bg-[#35363a]' : 'bg-white'} {dark ? 'dark' : ''}">
          <PigeonMark size={16} />
          <span class="truncate">{tabTitle}</span>
        </div>
      </div>
      <div class="flex h-10 items-center gap-2 px-2 {dark ? 'bg-[#35363a]' : 'bg-white'}">
        <span class="px-1 text-[15px] opacity-50">←</span>
        <span class="px-1 text-[15px] opacity-30">→</span>
        <div class="flex h-7 min-w-0 flex-1 items-center rounded-full px-3 text-[12px] {dark ? 'bg-[#202124]' : 'bg-[#f1f3f4]'}">
          <span class="truncate opacity-75">{scheme}/{page}</span>
        </div>
      </div>
    </div>
    <div style="width:{width * scale}px;height:{height * scale}px" class="relative overflow-hidden">
      {#key src}
        <iframe
          {src}
          title={tabTitle}
          class="absolute top-0 left-0 origin-top-left border-0"
          style="width:{width}px;height:{height}px;transform:scale({scale})"
        ></iframe>
      {/key}
    </div>
  </div>
</div>
