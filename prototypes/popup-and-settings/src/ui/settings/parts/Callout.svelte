<script lang="ts">
  // An inline notice inside settings: attention (amber), info (slate-blue) or done (teal). Each tone has its own
  // icon, so it never rests on colour alone.
  import type { Snippet } from "svelte";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import Info from "@lucide/svelte/icons/info";
  import CircleCheck from "@lucide/svelte/icons/circle-check";

  let {
    tone = "info",
    title,
    class: className = "",
    children,
    actions,
  }: { tone?: "attention" | "info" | "done"; title?: string; class?: string; children?: Snippet; actions?: Snippet } = $props();
  const toneClass = {
    attention: "border-warning-border bg-warning-soft",
    info: "border-border bg-info-soft",
    done: "border-success/30 bg-success-soft",
  } as const;
  const iconClass = { attention: "text-warning", info: "text-info", done: "text-success" } as const;
</script>

<div class="flex gap-3 rounded-xl border px-4 py-3 {toneClass[tone]} {className}" role="status">
  <span class="mt-0.5 shrink-0 {iconClass[tone]}">
    {#if tone === "attention"}<TriangleAlert class="size-4" />{:else if tone === "done"}<CircleCheck class="size-4" />{:else}<Info
        class="size-4"
      />{/if}
  </span>
  <div class="text-foreground min-w-0 flex-1 text-[13.5px] leading-5">
    {#if title}<p class="font-medium">{title}</p>{/if}
    {#if children}<div class="text-foreground/80 {title ? 'mt-0.5' : ''}">{@render children()}</div>{/if}
    {#if actions}<div class="mt-2.5 flex flex-wrap items-center gap-2">{@render actions()}</div>{/if}
  </div>
</div>
