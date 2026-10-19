<script lang="ts">
  // One quick-action button: idle icon, then busy, then done or failed (ticket 26 button states).
  import type { Component } from "svelte";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import Check from "@lucide/svelte/icons/check";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import { cn } from "$lib/utils";
  import { ui } from "./store.svelte";

  let {
    icon: Icon,
    label,
    busyKey,
    filled = false,
    dimmed = false,
    variant = "row",
    onclick,
  }: {
    icon: Component<{ class?: string; fill?: string }>;
    label: string;
    busyKey: string;
    filled?: boolean;
    dimmed?: boolean;
    variant?: "row" | "card" | "header";
    onclick: (e: MouseEvent) => void;
  } = $props();

  const status = $derived(ui.busy[busyKey]);
</script>

<button
  type="button"
  title={label}
  aria-label={label}
  class={cn(
    "inline-flex shrink-0 items-center justify-center rounded-full transition-colors",
    variant === "row" && "size-8 text-yt-text hover:bg-white/10",
    variant === "card" && "size-9 bg-black/70 text-white hover:bg-black",
    variant === "header" && "size-10 bg-white/10 text-white hover:bg-white/20",
    dimmed && "opacity-40",
  )}
  onclick={(e) => {
    e.stopPropagation();
    onclick(e);
  }}
>
  {#if status === "busy"}
    <LoaderCircle class="size-4 animate-spin" />
  {:else if status === "done"}
    <Check class="size-4" />
  {:else if status === "failed"}
    <CircleAlert class="size-4 text-red-400" />
  {:else}
    <Icon class="size-4" fill={filled ? "currentColor" : "none"} />
  {/if}
</button>
