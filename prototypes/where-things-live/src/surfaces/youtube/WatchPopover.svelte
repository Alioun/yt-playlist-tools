<script lang="ts">
  // The watch-page button's menu: the in-page twin of the popup's "This video" card, in YouTube's look.
  import X from "@lucide/svelte/icons/x";
  import Settings from "@lucide/svelte/icons/settings";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import {
    app,
    running,
    tabSetup,
    saveBlockedMessage,
    setupReadOnly,
    videoStatus,
    videoStatusText,
    playlistTitle,
    saveVideo,
    openSettingsAt,
    go,
    autoAddState,
    autoAddTargets,
    goalFor,
    toggleSkip,
    togglePause,
    type VideoStatus,
  } from "$lib/state.svelte";
  import { channels, watchVideo, type Video } from "$lib/data";
  import PlaylistPicker from "$lib/components/PlaylistPicker.svelte";
  import { cn } from "$lib/utils";

  let { video, onclose }: { video: Video; onclose: () => void } = $props();

  const setup = $derived(tabSetup());
  const blocked = $derived(saveBlockedMessage());
  /** The auto-add playlists that take what's playing (ticket 07: Videos / Shorts / Both). */
  const list = $derived(autoAddTargets());
  const autoOn = $derived(running("autoAdd"));
  const st = $derived(autoAddState(video.channel));
  const ch = $derived(channels[video.channel]);
  const readOnly = $derived(setupReadOnly());
  const membership = $derived(video.id === watchVideo.id ? app.watch.inPlaylists : []);

  const tone: Record<VideoStatus, string> = {
    "will-add": "text-yt-text",
    added: "text-emerald-400",
    already: "text-yt-muted",
    filtered: "text-amber-400",
    skipped: "text-yt-muted",
    failed: "text-red-400",
  };

  function filterSummary(pid: string) {
    const f = setup?.filters[pid];
    if (!f) return "No channel filter";
    if (!f.enabled) return "Channel filter off";
    const n = f.channels.length;
    return `${f.mode === "allow" ? "Allowlist" : "Denylist"} · ${n} ${n === 1 ? "channel" : "channels"}`;
  }

  function filterAction(pid: string): { label: string; run: () => void } | null {
    const s = setup;
    if (!s) return null;
    const f = s.filters[pid];
    const key = video.channel;
    if (f && !f.enabled) return null;
    if (!f) return { label: "Deny", run: () => (s.filters[pid] = { enabled: true, mode: "deny", channels: [key] }) };
    const listed = f.channels.includes(key);
    const add = () => f.channels.push(key);
    const remove = () => (f.channels = f.channels.filter((c) => c !== key));
    if (f.mode === "allow") return listed ? { label: "Stop allowing", run: remove } : { label: "Allow", run: add };
    return listed ? { label: "Stop denying", run: remove } : { label: "Deny", run: add };
  }

  const btn = "rounded-full bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20 disabled:opacity-40";
</script>

<div class="ext-mark w-80 rounded-xl bg-[#282828] p-3 text-sm text-yt-text shadow-2xl">
  <div class="mb-2 flex items-center">
    <span class="flex-1 font-medium">Playlist Tools</span>
    <button type="button" class="rounded-full p-1 hover:bg-white/10" aria-label="Close" onclick={onclose}><X class="size-4" /></button>
  </div>

  {#if blocked}
    <p class="text-yt-muted">{blocked}</p>
  {:else}
    {#if autoOn}
      <section class="mb-3 border-b border-white/10 pb-3">
        <p class="mb-1 text-xs font-medium tracking-wide text-yt-muted uppercase">Auto-add</p>
        {#if st.kind === "not-tracked"}
          <p class="text-yt-muted">{st.missing}</p>
          <button type="button" class="mt-1 text-xs text-sky-400 hover:underline" onclick={() => openSettingsAt("autoAdd")}
            >Auto-add settings</button
          >
        {:else}
          <div class="mb-1.5 flex items-center gap-2">
            <p class="flex-1">{st.text}</p>
            {#if st.action}
              <button type="button" class={btn} onclick={() => (st.action === "Resume" ? togglePause() : toggleSkip())}
                >{st.action}</button
              >
            {/if}
          </div>
          <ul class="space-y-1">
            {#each list as pid (pid)}
              {@const s = videoStatus(pid, video.channel)}
              <li class="flex items-center gap-2">
                <span class="min-w-0 flex-1 truncate">{playlistTitle(pid)}</span>
                <span class={cn("flex shrink-0 items-center gap-1 text-xs", tone[s])}>
                  {#if s === "failed"}<CircleAlert class="size-3.5" aria-label="Error" />{/if}
                  {s === "will-add" ? `At ${goalFor(pid)} %` : videoStatusText[s]}
                </span>
                {#if s === "failed"}
                  <button type="button" class="shrink-0 text-xs text-sky-400 hover:underline" onclick={() => openSettingsAt("autoAdd")}
                    >Settings</button
                  >
                {/if}
              </li>
            {/each}
          </ul>
          <div class="mt-2 flex flex-wrap gap-2">
            {#if st.kind === "counting" || st.kind === "partly"}
              <button type="button" class={btn} onclick={toggleSkip}>Don't auto-add this video</button>
            {/if}
            {#if !app.autoAddPaused}
              <!-- while paused, the status line above carries Resume -->
              <button type="button" class={btn} onclick={togglePause}>Pause auto-add</button>
            {/if}
          </div>

          <p class="mt-3 mb-1 text-xs font-medium tracking-wide text-yt-muted uppercase">This channel: {ch.title}</p>
          {#if readOnly}
            <p class="mb-1 text-xs text-yt-muted">Private window: change filters in a normal window.</p>
          {/if}
          <ul class="space-y-1">
            {#each list as pid (pid)}
              {@const a = filterAction(pid)}
              <li class="flex items-center gap-2">
                <span class="min-w-0 flex-1">
                  <span class="block truncate">{playlistTitle(pid)}</span>
                  <span class="block text-xs text-yt-muted">{filterSummary(pid)}</span>
                </span>
                {#if a}
                  <button type="button" class={btn} disabled={readOnly} onclick={a.run}>{a.label}</button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}

    <p class="mb-1 text-xs font-medium tracking-wide text-yt-muted uppercase">Save to…</p>
    <PlaylistPicker
      skin="yt"
      mode="action"
      {membership}
      maxHeight="10rem"
      onpick={(id) => saveVideo(id, video.title, "watchButton")}
    />
  {/if}

  <button
    type="button"
    class="mt-2 flex items-center gap-1.5 border-t border-white/10 pt-2 text-xs text-yt-muted hover:text-yt-text"
    onclick={() => go("settings")}
  >
    <Settings class="size-3.5" /> Playlist Tools settings
  </button>
</div>
