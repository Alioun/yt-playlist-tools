<script lang="ts">
  // "Playing now" (ticket 26's proposal), one compact row in the first view (ticket 24): title, artist and the
  // Save main button. The ▾ picker loads on demand. Reachable from the installed YouTube Music app's title bar too.
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Bookmark from "@lucide/svelte/icons/bookmark";
  import PlaylistPicker from "$lib/components/PlaylistPicker.svelte";
  import OnDemand from "./OnDemand.svelte";
  import { app, popupAccount, ensureSetup, setupReadOnly, playlistTitle } from "$lib/state.svelte";
  import { songs, thumb } from "$lib/data";

  const song = $derived(songs.find((s) => s.id === app.music.nowPlaying)!);
  const account = $derived(popupAccount());
  const quick = $derived(account ? (app.setups[account]?.musicQuickSave ?? null) : null);
  const membership = $derived(app.music.inPlaylists[song.id] ?? []);

  let picker = $state<null | "choose" | "pick">(null);
  let done = $state<{ text: string; failed: boolean } | null>(null);

  function save(pid: string) {
    const title = playlistTitle(pid, account ?? undefined);
    if (app.marks[pid]) {
      done = { text: `Couldn't save "${song.title}": ${title} ${app.marks[pid] === "full" ? "is full" : "doesn't exist anymore"}.`, failed: true };
      return;
    }
    if (!app.music.inPlaylists[song.id]) app.music.inPlaylists[song.id] = [];
    const list = app.music.inPlaylists[song.id];
    if (list.includes(pid)) {
      done = { text: `"${song.title}" is already in ${title}`, failed: false };
      return;
    }
    list.push(pid);
    done = { text: `Saved "${song.title}" to ${title}`, failed: false };
  }

  function choose(pid: string) {
    save(pid);
    // Choose mode: the pick becomes the quick-save playlist, except in a private window (ticket 26).
    if (account && !setupReadOnly() && done && !done.failed) {
      ensureSetup(account).musicQuickSave = pid;
      done = { text: `${done.text}. One click now saves there.`, failed: false };
    }
    picker = null;
  }
</script>

<section class="bg-muted/50 mb-3 rounded-lg border px-2.5 py-2">
  <div class="flex items-center gap-2">
    <div class="size-8 shrink-0 rounded" style={thumb(song.hue)} title="Playing now"></div>
    <div class="min-w-0 flex-1 leading-tight">
      <p class="truncate text-sm font-medium" title="Playing now: {song.title}">{song.title}</p>
      <p class="text-muted-foreground truncate text-xs">{song.artist}</p>
    </div>
    {#if !app.env.signedIn || !account}
      <span class="text-muted-foreground max-w-32 text-right text-[11px] leading-tight">Sign in to YouTube Music to save songs.</span>
    {:else}
      <div class="border-input bg-background flex shrink-0 overflow-hidden rounded-md border text-xs">
        <button
          type="button"
          class="hover:bg-muted flex max-w-28 items-center gap-1 px-2 py-1"
          title={quick ? `Save to ${playlistTitle(quick, account)}` : "Choose a playlist; it becomes the one-click one"}
          onclick={() => (quick ? save(quick) : (picker = picker === "choose" ? null : "choose"))}
        >
          <Bookmark class="size-3.5 shrink-0" />
          <span class="truncate">{quick ? `Save to ${playlistTitle(quick, account)}` : "Save to…"}</span>
        </button>
        <button
          type="button"
          class="border-input hover:bg-muted border-l px-1.5"
          aria-label="Choose a playlist"
          aria-expanded={picker === "pick"}
          onclick={() => (picker = picker === "pick" ? null : "pick")}><ChevronDown class="size-3.5" /></button
        >
      </div>
    {/if}
  </div>

  {#if done}
    <p class="mt-1.5 text-xs {done.failed ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}">{done.text}</p>
  {/if}
  {#if picker && account}
    <div class="bg-background mt-2 rounded-md border p-2">
      <OnDemand lines={4}>
        {#if picker === "choose"}<p class="mb-1.5 text-xs font-medium">Save songs to…</p>{/if}
        <PlaylistPicker
          {account}
          mode="action"
          {membership}
          maxHeight="11rem"
          onpick={(id) => (picker === "choose" ? choose(id) : save(id))}
        />
      </OnDemand>
    </div>
  {/if}
</section>
