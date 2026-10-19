<script lang="ts">
  // "This video": one status line at the top of the YouTube tab (ticket 24's light first view), with reserved
  // height so nothing shifts. It comes from the serving tab, not storage, so a skeleton shows briefly first.
  // "Details ›" unfolds the full card on demand: each auto-add playlist's outcome, this channel's Allow/Deny,
  // "Don't auto-add this video" and Save to…. The watch-page button's menu repeats that card on the page.
  // Ticket 07: one status line per playback (Undo on the status line), no "Add now".
  // Ticket 12: saves from the popup report inline; the picker row turning checked is the feedback.
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Clock from "@lucide/svelte/icons/clock";
  import Check from "@lucide/svelte/icons/check";
  import CheckCheck from "@lucide/svelte/icons/check-check";
  import Filter from "@lucide/svelte/icons/filter";
  import SkipForward from "@lucide/svelte/icons/skip-forward";
  import CircleX from "@lucide/svelte/icons/circle-x";
  import Minus from "@lucide/svelte/icons/minus";
  import Pause from "@lucide/svelte/icons/pause";
  import { Button } from "$lib/components/ui/button/index.js";
  import PlaylistPicker from "$lib/components/PlaylistPicker.svelte";
  import OnDemand from "./OnDemand.svelte";
  import {
    app,
    tabSetup,
    ensureSetup,
    setupReadOnly,
    videoStatus,
    videoStatusText,
    playlistTitle,
    running,
    autoAddState,
    optionsFor,
    goalFor,
    currentKind,
    togglePause,
    toggleSkip,
    type VideoStatus,
  } from "$lib/state.svelte";
  import { channels, watchVideo, shorts, thumb } from "$lib/data";
  import { cn } from "$lib/utils";
  import { sectionLabel } from "./helpers";

  const isShort = $derived(app.env.ytPage === "shorts");
  const inMiniplayer = $derived(app.env.ytPage === "home" && app.env.miniplayer);
  const video = $derived(isShort ? shorts[0] : watchVideo);
  const channelKey = $derived(video.channel as string);
  const channel = $derived(channels[channelKey]);
  const setup = $derived(tabSetup());
  const readonly = $derived(setupReadOnly());
  const aa = $derived(autoAddState(channelKey));
  const label = $derived(isShort ? "This Short" : inMiniplayer ? "Playing in the miniplayer" : "This video");

  /** The line comes from the serving tab: a brief skeleton after the popup opens. */
  let reading = $state(true);
  $effect(() => {
    const t = setTimeout(() => (reading = false), 150);
    return () => clearTimeout(t);
  });

  let open = $state(false);
  let saving = $state(false);

  const icon: Record<VideoStatus, { c: typeof Check; cls: string }> = {
    "will-add": { c: Clock, cls: "text-sky-600" },
    added: { c: Check, cls: "text-emerald-600" },
    already: { c: CheckCheck, cls: "text-emerald-600/70" },
    filtered: { c: Filter, cls: "text-muted-foreground" },
    skipped: { c: SkipForward, cls: "text-amber-600" },
    failed: { c: CircleX, cls: "text-destructive" },
  };

  const takesThis = (pid: string) => {
    const t = optionsFor(pid).takes;
    return t === "both" || t === currentKind();
  };

  /** Goals of the playlists still waiting, as ticks on the progress bar. */
  const goals = $derived([
    ...new Set(
      (setup?.autoAdd ?? []).filter((p) => takesThis(p) && videoStatus(p, channelKey) === "will-add").map((p) => goalFor(p)),
    ),
  ]);

  /** The filter action that makes sense for this channel on one playlist. */
  function filterAction(pid: string): { label: string; run: () => void } {
    const f = setup?.filters[pid];
    if (!f) {
      return {
        label: "Deny",
        run: () => (ensureSetup(app.env.account).filters[pid] = { enabled: true, mode: "deny", channels: [channelKey] }),
      };
    }
    const listed = f.channels.includes(channelKey);
    const toggle = () => {
      const ff = ensureSetup(app.env.account).filters[pid];
      ff.channels = listed ? ff.channels.filter((c) => c !== channelKey) : [...ff.channels, channelKey];
    };
    if (f.mode === "allow") return { label: listed ? "Stop allowing" : "Allow", run: toggle };
    return { label: listed ? "Stop denying" : "Deny", run: toggle };
  }
</script>

<section class="bg-muted/50 mb-3 rounded-lg border px-2.5 py-2">
  <!-- the status line: reserved height, so nothing shifts when it fills in -->
  <div class="flex min-h-10 items-center gap-2">
    {#if reading}
      <div class="flex-1 space-y-1.5" aria-busy="true" aria-label="Reading this tab">
        <div class="bg-muted h-2.5 w-16 animate-pulse rounded"></div>
        <div class="bg-muted h-3 w-48 animate-pulse rounded"></div>
      </div>
    {:else}
      <div class="min-w-0 flex-1">
        <p class={sectionLabel}>{label}</p>
        {#if !running("autoAdd")}
          <p class="text-muted-foreground truncate text-xs">Auto-add is off</p>
        {:else if aa.kind === "not-tracked"}
          <p class="text-muted-foreground truncate text-xs" title={aa.missing}>{aa.missing}</p>
        {:else}
          <p class="flex items-center gap-1 truncate text-xs font-medium" title={aa.text}>
            {#if aa.kind === "paused"}<Pause class="size-3 shrink-0 text-amber-600" />{/if}
            <span class="truncate">{aa.text}</span>
          </p>
        {/if}
      </div>
      {#if running("autoAdd") && aa.action === "Resume"}
        <Button size="xs" variant="outline" onclick={togglePause}>Resume</Button>
      {:else if running("autoAdd") && aa.action === "Undo"}
        <Button size="xs" variant="outline" onclick={toggleSkip}>Undo</Button>
      {/if}
      <button
        type="button"
        class="text-muted-foreground hover:bg-muted hover:text-foreground flex shrink-0 items-center rounded px-1 py-0.5 text-xs"
        aria-expanded={open}
        onclick={() => (open = !open)}
        >Details <ChevronRight class={cn("size-3.5 transition-transform", open && "rotate-90")} /></button
      >
    {/if}
  </div>

  {#if open && !reading}
    <div class="mt-2 border-t pt-2">
      <OnDemand lines={4}>
        <div class="mb-2 flex gap-2.5">
          <div class="h-9 w-14 shrink-0 rounded" style={thumb(video.hue)}></div>
          <div class="min-w-0">
            <p class="line-clamp-2 text-sm leading-tight font-medium">{video.title}</p>
            <p class="text-muted-foreground truncate text-xs">{channel.title}{channel.handle ? ` · ${channel.handle}` : ""}</p>
          </div>
        </div>

        {#if running("autoAdd") && aa.kind !== "not-tracked"}
          {#if aa.kind === "counting" || aa.kind === "partly"}
            <div class="bg-border relative mb-2 h-1 rounded-full" title="{app.watch.progress} % watched">
              <div class="bg-primary h-full rounded-full" style="width: {app.watch.progress}%"></div>
              {#each goals as g (g)}
                <span class="bg-foreground/60 absolute -top-0.5 h-2 w-px" style="left: {g}%" title="{g} %"></span>
              {/each}
            </div>
          {/if}

          <ul class="mb-2 space-y-1">
            {#each setup?.autoAdd ?? [] as pid (pid)}
              {@const s = videoStatus(pid, channelKey)}
              {@const action = filterAction(pid)}
              {@const I = icon[s]}
              <li class="flex items-center gap-2 text-xs">
                {#if takesThis(pid)}<I.c class="size-3.5 shrink-0 {I.cls}" />{:else}<Minus class="text-muted-foreground size-3.5 shrink-0" />{/if}
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium">{playlistTitle(pid)}</span>
                  {#if !takesThis(pid)}
                    <span class="text-muted-foreground block truncate"
                      >Takes {optionsFor(pid).takes === "shorts" ? "Shorts" : "videos"} only</span
                    >
                  {:else}
                    <span class="block truncate {s === 'failed' ? 'text-destructive' : 'text-muted-foreground'}"
                      >{s === "will-add" ? `At ${goalFor(pid)} %` : videoStatusText[s]}</span
                    >
                  {/if}
                </span>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={readonly}
                  title="Channel filter on {playlistTitle(pid)} for {channel.title}"
                  onclick={action.run}>{action.label}</Button
                >
              </li>
            {/each}
          </ul>
          <p class="text-muted-foreground mb-2 text-[11px]">Allow and Deny change each playlist's channel filter for {channel.title}.</p>
          {#if !app.watch.skipped && (aa.kind === "counting" || aa.kind === "partly")}
            <Button size="xs" variant="outline" class="mb-2" onclick={toggleSkip}>Don't auto-add this video</Button>
          {/if}
        {/if}

        <Button size="xs" variant="outline" class="w-full justify-between" onclick={() => (saving = !saving)} aria-expanded={saving}>
          Save to… <ChevronDown class="size-3" />
        </Button>
        {#if saving}
          <div class="bg-background mt-2 rounded-md border p-2">
            <OnDemand lines={4}>
              <!-- The row turning checked is the feedback (ticket 12: no page toast for adds from the popup). -->
              <PlaylistPicker
                account={app.env.account}
                mode="action"
                membership={app.watch.inPlaylists}
                maxHeight="12rem"
                onpick={(id) => {
                  if (!app.watch.inPlaylists.includes(id)) app.watch.inPlaylists.push(id);
                }}
              />
            </OnDemand>
          </div>
        {/if}
      </OnDemand>
    </div>
  {/if}
</section>
