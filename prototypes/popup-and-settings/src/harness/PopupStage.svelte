<script lang="ts">
  // A mock browser toolbar with the extension's button, and the real popup (popup.html) in a frame anchored under it,
  // as Chrome and Firefox draw a toolbar popup. Prototype chrome: neutral greys, nothing of the product's palette.
  import ToolbarIcon from "./ToolbarIcon.svelte";
  import AutoFrame from "./AutoFrame.svelte";
  import { addressOf, badgeOf, live } from "./live.svelte";
  import { frameSrc, h } from "./url.svelte";

  let { theme, narrow = false }: { theme: "light" | "dark"; narrow?: boolean } = $props();
  const dark = $derived(theme === "dark");
  const badge = $derived(badgeOf(live.s));
  const addr = $derived(addressOf(live.s));
  const env = $derived(live.s?.env);
  const firefox = $derived((h.browser || env?.browser) === "firefox");
  const src = $derived(frameSrc("popup", theme, { variant: h.variant === "A" ? "" : h.variant }));
</script>

<div class="max-w-full {narrow ? 'w-[440px]' : 'w-[620px]'}">
  <div
    class="overflow-hidden rounded-t-xl border {dark ? 'border-white/10 bg-[#202124] text-white/85' : 'border-black/10 bg-[#dee1e6] text-black/80'}"
  >
    {#if env?.installedApp}
      <div class="flex h-10 items-center gap-2 px-3 text-[12.5px] {dark ? 'bg-[#2b2b2f]' : 'bg-[#e9ebee]'}">
        <span class="font-medium">YouTube Music</span>
        <span class="opacity-60">installed app window</span>
        <span class="ml-auto"><ToolbarIcon badge={badge.text} title={badge.title} {dark} active /></span>
        <span class="tracking-widest opacity-60">⋮</span>
      </div>
    {:else}
      <div class="flex h-9 items-end gap-1 px-2 pt-1.5">
        <div
          class="flex h-full max-w-[260px] min-w-0 items-center gap-2 rounded-t-lg px-3 text-[12px] {dark ? 'bg-[#35363a]' : 'bg-white'}"
        >
          <span class="size-3.5 shrink-0 rounded-sm {addr.site === 'other' ? 'bg-sky-600/70' : 'bg-zinc-500/60'}"></span>
          <span class="truncate">{env?.privateWindow ? "Private · " : ""}{addr.title}</span>
        </div>
      </div>
      <div class="flex h-11 items-center gap-2 px-2 {dark ? 'bg-[#35363a]' : 'bg-white'}">
        <span class="px-1 text-[15px] opacity-50">←</span>
        <span class="px-1 text-[15px] opacity-30">→</span>
        <div
          class="flex h-8 min-w-0 flex-1 items-center rounded-full px-3 text-[12.5px] {dark ? 'bg-[#202124]' : 'bg-[#f1f3f4]'}"
          title={firefox ? "Firefox" : "Chrome"}
        >
          <span class="truncate opacity-75">{addr.url}</span>
        </div>
        <span class="relative">
          <ToolbarIcon badge={badge.text} title={badge.title} {dark} active />
        </span>
        <span class="px-1 tracking-widest opacity-50">⋮</span>
      </div>
    {/if}
  </div>
  <div class="relative h-[612px] rounded-b-xl border border-t-0 {dark ? 'border-white/10 bg-[#0f0f12]' : 'border-black/10 bg-[#f6f6f7]'}">
    <!-- a hint of the page behind the popup -->
    <div class="absolute inset-x-6 top-6 space-y-3 opacity-60">
      <div class="h-40 rounded-lg {dark ? 'bg-white/5' : 'bg-black/5'}"></div>
      <div class="h-3 w-2/3 rounded {dark ? 'bg-white/5' : 'bg-black/5'}"></div>
      <div class="h-3 w-1/3 rounded {dark ? 'bg-white/5' : 'bg-black/5'}"></div>
    </div>
    <div
      class="absolute top-1.5 {narrow ? 'right-3' : 'right-6'} overflow-hidden rounded-[10px] {dark ? 'ring-1 ring-white/10' : 'ring-1 ring-black/10'}"
      style="box-shadow: 0 2px 6px rgb(0 0 0 / .12), 0 18px 48px -12px rgb(0 0 0 / .35)"
    >
      {#key src}
        <AutoFrame {src} title="Playlist Pigeon popup ({theme})" />
      {/key}
    </div>
  </div>
</div>
