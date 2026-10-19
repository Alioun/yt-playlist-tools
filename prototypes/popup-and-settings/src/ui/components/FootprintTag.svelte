<script lang="ts">
  // Ticket 09's footprint tag: whether a feature changes how YouTube looks. The user's principle: changing the page
  // is always their choice, so every feature says up front what it does to the page.
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import Keyboard from "@lucide/svelte/icons/keyboard";
  import MousePointerClick from "@lucide/svelte/icons/mouse-pointer-click";
  import SquarePlus from "@lucide/svelte/icons/square-plus";
  import { footprintLabel, type Footprint } from "$shared/features/registry";
  let { footprint, class: className = "" }: { footprint: Footprint; class?: string } = $props();
  const Icon = $derived({ none: EyeOff, keys: Keyboard, buttons: SquarePlus, "right-click": MousePointerClick }[footprint]);
  const changes = $derived(footprint === "buttons" || footprint === "right-click");
</script>

<span
  class="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap
    {changes ? 'border-primary/25 bg-accent text-accent-foreground' : 'bg-muted/60 text-muted-foreground'} {className}"
>
  <Icon class="size-3" />{footprintLabel[footprint]}
</span>
