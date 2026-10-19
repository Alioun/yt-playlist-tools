<script lang="ts">
  // Tells the user whether a feature changes YouTube's look (the user's "page changes are always my choice" rule).
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import Keyboard from "@lucide/svelte/icons/keyboard";
  import MousePointerClick from "@lucide/svelte/icons/mouse-pointer-click";
  import MousePointer2 from "@lucide/svelte/icons/mouse-pointer-2";
  import { footprintLabel, type Footprint } from "$lib/ia";
  import { cn } from "$lib/utils";

  let { footprint, class: className = "" }: { footprint: Footprint; class?: string } = $props();
  const Icon = $derived(
    { background: EyeOff, keys: Keyboard, buttons: MousePointerClick, "right-click": MousePointer2 }[footprint],
  );
  const changesPage = $derived(footprint === "buttons" || footprint === "right-click");
</script>

<span
  class={cn(
    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] leading-none",
    changesPage ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground",
    className,
  )}
>
  <Icon class="size-3" />
  {footprintLabel[footprint]}
</span>
