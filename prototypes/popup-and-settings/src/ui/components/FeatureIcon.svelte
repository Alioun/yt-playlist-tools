<script lang="ts">
  // One glyph per feature, on a soft tile: violet while on, grey while off. No play triangles anywhere (ticket 22).
  import type { FeatureId } from "$shared/model/types";
  import Glyph from "./Glyph.svelte";

  let { id, on = true, size = 30 }: { id: FeatureId; on?: boolean; size?: number } = $props();
  const name = $derived(
    (
      {
        autoAdd: "list-plus",
        shortcuts: "keyboard",
        quickSave: "bookmark-plus",
        queueButton: "list-end",
        watchButton: "rectangle-ellipsis",
        cardMenu: "mouse-pointer-click",
        musicQuickActions: "list-music",
        musicShortcuts: "keyboard-music",
      } as const
    )[id],
  );
</script>

<span
  class="inline-flex shrink-0 items-center justify-center rounded-[9px] transition-colors
    {on ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground'}"
  style="width:{size}px;height:{size}px"
  aria-hidden="true"
>
  <Glyph {name} style="width:{Math.round(size * 0.55)}px;height:{Math.round(size * 0.55)}px" strokeWidth={1.9} />
</span>
