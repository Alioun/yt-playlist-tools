<script lang="ts">
  // The extension's toolbar icon (placeholder art; the real icon is ticket 22's call).
  import { cn } from "$lib/utils";
  let { badge = null, class: className = "" }: { badge?: string | null; class?: string } = $props();
</script>

<span class={cn("relative inline-flex size-6 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground", className)}>
  PT
  {#if badge}
    <span
      class={cn(
        "absolute -right-1.5 -bottom-1.5 min-w-3.5 rounded-sm px-0.5 text-center text-[9px] leading-3.5 font-bold text-white",
        badge === "!" ? "bg-orange-600" : "bg-emerald-600",
      )}>{badge}</span
    >
  {/if}
</span>
