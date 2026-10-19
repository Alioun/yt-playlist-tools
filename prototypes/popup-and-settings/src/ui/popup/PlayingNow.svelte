<script lang="ts">
  import Glyph from "$ui/components/Glyph.svelte";
  // Playing now (ticket 26's proposal, adopted by ticket 09): the playing song with Save in one click and ▾ for the
  // picker. Reachable from the installed YouTube Music app's title bar, where no side panel opens (ticket 21).
  // An add started here reports inline, never as a page toast (ticket 12).
  import { tabAccount, call, setupOf, titleOf, ui } from "$lib/view.svelte";
  import { openPicker } from "./sheet.svelte";

  const song = $derived(ui.tab.state === "ready" ? ui.tab.playing : null);
  const acct = $derived(tabAccount());
  const target = $derived(setupOf(acct)?.musicQuickSave ?? null);
  let saveState = $state<"idle" | "busy" | "added" | "already" | "failed">("idle");
  let error = $state("");

  async function save() {
    if (!song || !acct) return;
    if (!target) return picker(true);
    saveState = "busy";
    const r = await call("add", { acct, item: song.id, playlist: target });
    saveState = r.outcome;
    error = r.outcome === "failed" ? r.error : "";
  }
  async function undo() {
    if (!song || !acct || !target) return;
    saveState = "busy";
    await call("remove", { acct, item: song.id, playlist: target });
    saveState = "idle";
  }
  function picker(setsQuickSave = false) {
    if (!song || !acct) return;
    openPicker({ mode: "save", site: "music", acct, item: { id: song.id, title: song.title, kind: "song" }, setsQuickSave });
  }
</script>

{#if ui.tab.state === "waiting" && ui.s.env.musicOpen && ui.s.consent === "accepted"}
  <div class="bg-card flex h-[62px] items-center gap-3 rounded-xl border px-3" aria-busy="true">
    <span class="bg-muted size-10 animate-pulse rounded-md"></span>
    <span class="flex flex-col gap-2"><span class="bg-muted h-2.5 w-28 animate-pulse rounded-full"></span><span class="bg-muted h-2 w-16 animate-pulse rounded-full"></span></span>
  </div>
{:else if song}
  <div class="bg-card rounded-xl border px-3 py-2.5">
    <div class="flex items-center gap-3">
      <span
        class="relative size-10 shrink-0 overflow-hidden rounded-md shadow-sm"
        style="background-image:linear-gradient(135deg, oklch(0.62 0.13 {song.hue}), oklch(0.38 0.12 {(song.hue + 40) % 360}))"
        aria-hidden="true"
      >
        <span class="absolute right-1 bottom-1 flex items-end gap-[2px]">
          <span class="h-2 w-[3px] animate-pulse rounded-full bg-white/90"></span>
          <span class="h-3 w-[3px] animate-pulse rounded-full bg-white/90 [animation-delay:200ms]"></span>
          <span class="h-1.5 w-[3px] animate-pulse rounded-full bg-white/90 [animation-delay:400ms]"></span>
        </span>
      </span>
      <div class="min-w-0 flex-1 leading-tight">
        <div class="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Playing now</div>
        <div class="truncate text-[13px] font-medium">{song.title}</div>
        <div class="text-muted-foreground truncate text-xs">{song.artist}</div>
      </div>
      {#if acct}
        <div class="flex shrink-0 items-stretch rounded-lg border shadow-[0_1px_0_rgb(0_0_0/0.03)]">
          <button
            type="button"
            class="hover:bg-muted inline-flex h-8 max-w-[118px] items-center gap-1.5 rounded-l-[7px] pr-2 pl-2.5 text-xs font-medium disabled:opacity-60"
            disabled={saveState === "busy"}
            title={target ? `Save to ${titleOf(target)}` : "Save to playlist…"}
            onclick={save}
          >
            {#if saveState === "busy"}<Glyph name="loader-circle" class="size-3.5 shrink-0 animate-spin" />
            {:else if saveState === "added" || saveState === "already"}<Glyph name="check" class="text-success size-3.5 shrink-0" strokeWidth={2.5} />
            {:else}<Glyph name="bookmark" class="size-3.5 shrink-0" />{/if}
            <span class="truncate">{target ? "Save" : "Save to…"}</span>
          </button>
          <button
            type="button"
            class="hover:bg-muted inline-flex h-8 w-7 items-center justify-center rounded-r-[7px] border-l"
            aria-label="Save to another playlist"
            onclick={() => picker()}
          >
            <Glyph name="chevron-down" class="size-3.5" />
          </button>
        </div>
      {/if}
    </div>
    <div class="text-muted-foreground mt-2 flex min-h-[18px] items-center gap-1 pl-[52px] text-xs" aria-live="polite">
      {#if saveState === "added"}
        <span class="text-success">Saved to {titleOf(target)}.</span>
        <button type="button" class="text-primary font-medium hover:underline" onclick={undo}>Undo</button>
      {:else if saveState === "already"}
        <span>Already in {titleOf(target)}.</span>
      {:else if saveState === "failed"}
        <Glyph name="circle-alert" class="text-destructive size-3.5" /><span class="text-destructive">Couldn't save: {error}</span>
      {:else if target}
        One click saves to <span class="text-foreground font-medium">{titleOf(target)}</span>
      {:else if acct}
        Your first pick becomes the one-click playlist.
      {/if}
    </div>
  </div>
{/if}
