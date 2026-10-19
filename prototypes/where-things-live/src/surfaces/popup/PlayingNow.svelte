<script lang="ts">
  // "Playing now" (ticket 26's proposal): Save the playing song in one click, or open the picker.
  // Reachable from the installed YouTube Music app's title bar too.
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Bookmark from "@lucide/svelte/icons/bookmark";
  import PlaylistPicker from "$lib/components/PlaylistPicker.svelte";
  import { app, popupAccount, ensureSetup, setupReadOnly, playlistTitle } from "$lib/state.svelte";
  import { songs, thumb } from "$lib/data";
  import { sectionLabel } from "./helpers";

  const song = $derived(songs.find((s) => s.id === app.music.nowPlaying)!);
  const account = $derived(popupAccount());
  const quick = $derived(account ? (app.setups[account]?.musicQuickSave ?? null) : null);
  const membership = $derived(app.music.inPlaylists[song.id] ?? []);

  let picker = $state<null | "choose" | "pick">(null);
  let done = $state("");

  function save(pid: string) {
    if (app.marks[pid]) {
      done = `Couldn't save "${song.title}": ${playlistTitle(pid, account ?? undefined)} ${app.marks[pid] === "full" ? "is full" : "doesn't exist anymore"}.`;
      return;
    }
    if (!app.music.inPlaylists[song.id]) app.music.inPlaylists[song.id] = [];
    const list = app.music.inPlaylists[song.id];
    if (list.includes(pid)) {
      done = `"${song.title}" is already in ${playlistTitle(pid, account ?? undefined)}`;
      return;
    }
    list.push(pid);
    done = `Saved "${song.title}" to ${playlistTitle(pid, account ?? undefined)}`;
  }

  function choose(pid: string) {
    save(pid);
    // Choose mode: the pick becomes the quick-save playlist, except in a private window (ticket 26).
    if (account && !setupReadOnly()) {
      ensureSetup(account).musicQuickSave = pid;
      done += ". One click now saves there.";
    }
    picker = null;
  }
</script>

<section class="bg-muted/50 mb-3 rounded-lg border p-2.5">
  <p class="{sectionLabel} mb-1.5">Playing now</p>
  <div class="mb-2 flex items-center gap-2.5">
    <div class="size-10 shrink-0 rounded" style={thumb(song.hue)}></div>
    <div class="min-w-0">
      <p class="truncate text-sm font-medium">{song.title}</p>
      <p class="text-muted-foreground truncate text-xs">{song.artist} · {song.album}</p>
    </div>
  </div>

  {#if !app.env.signedIn || !account}
    <p class="text-muted-foreground text-xs">Sign in to YouTube Music to save songs.</p>
  {:else}
    <div class="border-input flex overflow-hidden rounded-md border text-xs">
      <button
        type="button"
        class="hover:bg-background flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left"
        onclick={() => (quick ? save(quick) : (picker = picker === "choose" ? null : "choose"))}
      >
        <Bookmark class="size-3.5 shrink-0" />
        <span class="truncate">{quick ? `Save to ${playlistTitle(quick, account)}` : "Save to playlist…"}</span>
      </button>
      <button
        type="button"
        class="border-input hover:bg-background border-l px-2"
        aria-label="Choose a playlist"
        aria-expanded={picker === "pick"}
        onclick={() => (picker = picker === "pick" ? null : "pick")}><ChevronDown class="size-3.5" /></button
      >
    </div>
    {#if done}<p class="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400">{done}</p>{/if}
    {#if picker}
      <div class="bg-background mt-2 rounded-md border p-2">
        {#if picker === "choose"}<p class="mb-1.5 text-xs font-medium">Save songs to…</p>{/if}
        <PlaylistPicker
          {account}
          mode="action"
          {membership}
          maxHeight="11rem"
          onpick={(id) => (picker === "choose" ? choose(id) : save(id))}
        />
      </div>
    {/if}
  {/if}
</section>
