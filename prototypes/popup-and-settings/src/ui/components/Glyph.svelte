<script lang="ts">
  // A Lucide icon from inline path data (glyphs.ts), for the popup's first view: Lucide's Svelte components cost about
  // 4 KB gzip there, this costs about 1 KB (ticket 24's 40 KB). Same look and the same 24-unit grid as Lucide.
  import { glyphs, type GlyphName } from "./glyphs";
  let {
    name,
    class: className = "",
    strokeWidth = 2,
    style,
  }: { name: GlyphName; class?: string; strokeWidth?: number; style?: string } = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  class={className}
  {style}
  aria-hidden="true">{@html glyphs[name]}</svg
>
