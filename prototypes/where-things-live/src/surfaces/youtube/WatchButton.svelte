<script lang="ts">
  // OUR watch-page button. "pill": in YouTube's action row after Save and …; "round": in the Shorts action column.
  // Its label is ticket 07's auto-add state (draft copy); without auto-add it's a plain Save.
  import BookmarkPlus from "@lucide/svelte/icons/bookmark-plus";
  import Check from "@lucide/svelte/icons/check";
  import Ban from "@lucide/svelte/icons/ban";
  import Pause from "@lucide/svelte/icons/pause";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import { app, autoAddState, autoAddTargets, videoStatus, goalFor } from "$lib/state.svelte";
  import type { Video } from "$lib/data";
  import WatchPopover from "./WatchPopover.svelte";
  import { cn } from "$lib/utils";

  let { video, variant = "pill" }: { video: Video; variant?: "pill" | "round" } = $props();

  let open = $state(false);

  type Look = "save" | "ring" | "done" | "failed" | "paused" | "skipped";

  const status = $derived.by((): { look: Look; label: string; short: string; pct?: number } => {
    const st = autoAddState(video.channel);
    const pending = autoAddTargets().filter((p) => videoStatus(p, video.channel) === "will-add");
    const goal = pending.length ? Math.min(...pending.map((p) => goalFor(p))) : 0;
    const pct = goal <= 0 ? 100 : Math.min(100, Math.round((app.watch.progress / goal) * 100));
    switch (st.kind) {
      case "counting":
        return { look: "ring", label: `Auto-adds at ${goal} %`, short: "Auto-add", pct };
      case "partly":
        return { look: "ring", label: `Added · more at ${goal} %`, short: "Added", pct };
      case "done":
        if (st.text.startsWith("Auto-added")) return { look: "done", label: "Auto-added", short: "Added" };
        if (st.text.startsWith("Already in")) return { look: "done", label: "Already in", short: "Already in" };
        if (st.text.startsWith("Couldn't")) return { look: "failed", label: "Couldn't add", short: "Couldn't add" };
        return { look: "skipped", label: "Filtered out", short: "Filtered out" };
      case "paused":
        return { look: "paused", label: "Auto-add paused", short: "Paused" };
      case "skipped":
        return { look: "skipped", label: "Not auto-adding", short: "Not adding" };
      default:
        return { look: "save", label: "Save", short: "Save" };
    }
  });

  const title = $derived(autoAddState(video.channel).text || "Playlist Tools: save this video");

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") open = false;
  }
</script>

<svelte:window {onkeydown} />

{#snippet icon(size: string)}
  {#if status.look === "ring"}
    <svg viewBox="0 0 20 20" class={size} aria-hidden="true">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="2.5" />
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-dasharray="{(status.pct ?? 0) * 0.5027} 50.27"
        transform="rotate(-90 10 10)"
      />
    </svg>
  {:else if status.look === "failed"}
    <CircleAlert class={cn(size, "text-red-400")} aria-label="Error" />
  {:else if status.look === "done"}
    <Check class={cn(size, "text-emerald-400")} />
  {:else if status.look === "paused"}
    <Pause class={size} />
  {:else if status.look === "skipped"}
    <Ban class={cn(size, "text-yt-muted")} />
  {:else}
    <BookmarkPlus class={size} />
  {/if}
{/snippet}

<div class="relative">
  {#if variant === "pill"}
    <button
      type="button"
      class="ext-mark flex h-9 items-center gap-2 rounded-full bg-yt-raised px-3 text-sm font-medium whitespace-nowrap hover:bg-[#3f3f3f]"
      {title}
      aria-expanded={open}
      onclick={() => (open = !open)}
    >
      {@render icon("size-5")}
      {status.label}
    </button>
  {:else}
    <button type="button" class="flex flex-col items-center gap-1 text-xs" {title} aria-expanded={open} onclick={() => (open = !open)}>
      <span class="ext-mark flex size-12 items-center justify-center rounded-full bg-yt-raised hover:bg-[#3f3f3f]">
        {@render icon("size-6")}
      </span>
      {status.short}
    </button>
  {/if}

  {#if open}
    <button type="button" class="fixed inset-0 z-20 cursor-default" aria-label="Close" onclick={() => (open = false)}></button>
    <div class={cn("absolute z-30", variant === "pill" ? "top-full right-0 mt-2" : "right-full bottom-0 mr-3")}>
      <WatchPopover {video} onclose={() => (open = false)} />
    </div>
  {/if}
</div>
