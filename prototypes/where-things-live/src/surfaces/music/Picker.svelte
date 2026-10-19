<script lang="ts">
  // The Save-to-playlist picker in YouTube Music's look (ticket 26): anchored to the button,
  // or centred above the player when a key opened it. Choose mode when no quick-save playlist is set.
  // Pins set the quick-save playlist; ticking saves at once; unticking removes (PROVISIONAL in ticket 26).
  import X from "@lucide/svelte/icons/x";
  import Pin from "@lucide/svelte/icons/pin";
  import PlaylistPicker from "$lib/components/PlaylistPicker.svelte";
  import { app, tabSetup } from "$lib/state.svelte";
  import { cn } from "$lib/utils";
  import { ui, closePicker } from "./store.svelte";
  import { pickInPicker, pinQuickSave, songById, q } from "./actions";

  const song = $derived(ui.picker.songId ? songById(ui.picker.songId) : null);
  const quick = $derived(tabSetup()?.musicQuickSave ?? null);
  const membership = $derived(song ? (app.music.inPlaylists[song.id] ?? []) : []);

  function onkeydown(e: KeyboardEvent) {
    if (ui.picker.open && e.key === "Escape") closePicker();
  }
</script>

<svelte:window {onkeydown} />

{#if ui.picker.open && song}
  <!-- click outside closes -->
  <button type="button" class="absolute inset-0 z-40 cursor-default" aria-label="Close the picker" onclick={closePicker}></button>
  <div
    class={cn(
      "ext-mark bg-ytm-raised text-yt-text absolute z-50 w-[300px] rounded-lg p-3 shadow-2xl ring-1 ring-white/10",
      !ui.picker.at && "bottom-24 left-1/2 -translate-x-1/2",
    )}
    style={ui.picker.at ? `left:${ui.picker.at.x}px; top:${ui.picker.at.y}px` : ""}
  >
    <div class="mb-2 flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium">{ui.picker.choose ? "Save songs to…" : "Save to playlist"}</p>
        <p class="text-yt-muted truncate text-xs">
          {ui.picker.choose ? `Your pick saves ${q(song.title)} and becomes the one-click playlist.` : q(song.title)}
        </p>
      </div>
      <button type="button" class="rounded-full p-1 hover:bg-white/10" aria-label="Close" onclick={closePicker}><X class="size-4" /></button>
    </div>
    <PlaylistPicker
      account={app.env.account}
      mode="action"
      skin="yt"
      {membership}
      maxHeight="15rem"
      onpick={pickInPicker}
    >
      {#snippet rowExtra(p)}
        {#if !ui.picker.choose}
          <button
            type="button"
            class={cn("rounded-full p-1 hover:bg-white/10", quick === p.id ? "text-white" : "text-yt-muted opacity-0 group-hover:opacity-100")}
            title={app.env.privateWindow ? "Private windows don't save settings" : quick === p.id ? "One-click save goes here" : "Use for one-click save"}
            disabled={app.env.privateWindow}
            onclick={() => pinQuickSave(p.id)}
          >
            <Pin class="size-3.5" fill={quick === p.id ? "currentColor" : "none"} />
          </button>
        {/if}
      {/snippet}
    </PlaylistPicker>
  </div>
{/if}
