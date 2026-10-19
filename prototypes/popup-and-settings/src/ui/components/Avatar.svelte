<script lang="ts">
  import Glyph from "$ui/components/Glyph.svelte";
  // An account's avatar: its initial on a colour from the account label (YouTube's avatar URL in the product).
  import type { AccountLabel } from "$shared/model/types";
  let { label = null, size = 32, class: className = "" }: { label?: AccountLabel | null; size?: number; class?: string } = $props();
</script>

{#if label}
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none {className}"
    style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.42)}px;background:linear-gradient(135deg, oklch(0.66 0.11 {label.hue}), oklch(0.5 0.12 {(label.hue + 30) % 360}))"
    aria-hidden="true">{label.name[0]}</span
  >
{:else}
  <span
    class="bg-muted text-muted-foreground inline-flex shrink-0 items-center justify-center rounded-full {className}"
    style="width:{size}px;height:{size}px"
    aria-hidden="true"><Glyph name="user-round" class="size-1/2" /></span
  >
{/if}
