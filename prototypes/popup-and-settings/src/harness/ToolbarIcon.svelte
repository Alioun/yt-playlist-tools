<script lang="ts">
  // The extension's toolbar button as the browser draws it: the 16 px pigeon, and the badge (ticket 09, 18): an
  // amber "!" when something needs you.
  import PigeonMark from "$ui/components/PigeonMark.svelte";
  let {
    badge = "",
    title = "Playlist Pigeon",
    dark = false,
    active = false,
    size = 16,
  }: { badge?: string; title?: string; dark?: boolean; active?: boolean; size?: number } = $props();
</script>

<span
  class="relative inline-flex size-8 items-center justify-center rounded-full {active ? (dark ? 'bg-white/15' : 'bg-black/10') : ''} {dark ? 'dark' : ''}"
  {title}
>
  <PigeonMark {size} />
  {#if badge}
    <span
      class="absolute right-0 bottom-0.5 flex h-[13px] min-w-[13px] items-center justify-center rounded-[3px] px-[3px] text-[9.5px] leading-none font-bold"
      style="background:#E8A317;color:#1d1300">{badge}</span
    >
  {/if}
</span>
