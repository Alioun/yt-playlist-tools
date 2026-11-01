<script lang="ts">
  import { glyphs, type GlyphName } from "./glyphs"

  let { name, class: className = "size-4", strokeWidth = 2 }: { name: GlyphName; class?: string; strokeWidth?: number } = $props()
</script>

<svg
  class={className}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#each glyphs[name] as shape, index (index)}
    {#if shape.kind === "path"}<path d={shape.d} />{:else}<circle cx={shape.cx} cy={shape.cy} r={shape.r} />{/if}
  {/each}
</svg>
