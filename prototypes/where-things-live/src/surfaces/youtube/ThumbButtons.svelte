<script lang="ts">
  // OUR thumbnail buttons: top-left, stacked (queue, then quick-save), on hover or keyboard focus.
  // YouTube's own hover buttons keep the top-right; the duration keeps the bottom-right.
  // Quick-save is a split button (tickets 12/26): the main part saves to the quick-save playlist in one click,
  // ▾ opens the picker for a one-off save. With no quick-save playlist, the main part opens the picker in choose mode.
  import ListPlus from "@lucide/svelte/icons/list-plus";
  import BookmarkPlus from "@lucide/svelte/icons/bookmark-plus";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Check from "@lucide/svelte/icons/check";
  import { app, running, toast, playlistTitle, saveVideo, healthOf } from "$lib/state.svelte";
  import type { Video } from "$lib/data";
  import { yt, short as cut, quickSaveTarget, blockedToast, willSave } from "./yt.svelte";
  import { cn } from "$lib/utils";

  let { video, short = false }: { video: Video; short?: boolean } = $props();

  let queued = $state(false);
  let saved = $state(false);

  // Ticket 18: a feature that isn't working in this tab draws nothing.
  const showQueue = $derived(!short && running("queueButton") && healthOf("queueButton") !== "broken");
  const showSave = $derived(
    running("quickSave") && healthOf("quickSave") !== "broken" && (!short || app.features.quickSave.onShorts),
  );
  const target = $derived(quickSaveTarget());

  function queue(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    queued = true;
    if (app.features.queueButton.toast) toast("youtube", `Added "${cut(video.title)}" to the queue`, "Undo");
    setTimeout(() => (queued = false), 1500);
  }

  function openPicker(e: MouseEvent, choose: boolean) {
    const r = ((e.currentTarget as HTMLElement).closest("[data-split]") as HTMLElement).getBoundingClientRect();
    yt.picker = { video, x: r.left, y: r.bottom + 4, choose };
  }

  function save(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (blockedToast()) return;
    if (!target) return openPicker(e, true);
    const ok = willSave(target);
    saveVideo(target, video.title, "quickSave");
    if (ok) {
      saved = true;
      setTimeout(() => (saved = false), 1500);
    }
  }

  function more(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (blockedToast()) return;
    openPicker(e, false);
  }

  const btn = "flex h-7 items-center justify-center bg-black/80 text-white hover:bg-black";
</script>

{#if showQueue || showSave}
  <div
    class={cn(
      "absolute top-1.5 left-1.5 z-10 flex flex-col items-start gap-1.5 transition-opacity",
      yt.showHover ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
    )}
  >
    {#if showQueue}
      <button
        type="button"
        class={cn(btn, "ext-mark w-7 rounded-md", queued && "bg-emerald-600 hover:bg-emerald-600")}
        title="Add to queue"
        onclick={queue}
      >
        {#if queued}<Check class="size-4" />{:else}<ListPlus class="size-4" />{/if}
      </button>
    {/if}
    {#if showSave}
      <span class="ext-mark flex rounded-md" data-split>
        <button
          type="button"
          class={cn(btn, "w-7 rounded-l-md", !target && "rounded-r-md", saved && "bg-emerald-600 hover:bg-emerald-600")}
          title={target ? `Save to ${playlistTitle(target)}` : "Save to…"}
          onclick={save}
        >
          {#if saved}<Check class="size-4" />{:else}<BookmarkPlus class="size-4" />{/if}
        </button>
        {#if target}
          <button
            type="button"
            class={cn(btn, "w-4 rounded-r-md border-l border-white/20")}
            title="Save to another playlist…"
            onclick={more}
          >
            <ChevronDown class="size-3" />
          </button>
        {/if}
      </span>
    {/if}
  </div>
{/if}
