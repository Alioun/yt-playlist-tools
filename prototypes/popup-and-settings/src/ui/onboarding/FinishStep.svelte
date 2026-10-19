<script lang="ts">
  import "./onboarding-more.css";
  // Step 3, "Finish setting up" (ticket 09): first the YouTube state (access, a tab, signed in, the account), then
  // one row per chosen feature: auto-add's playlists, Alt+W's playlist (Watch later on every account), the
  // quick-save playlists, or "Ready". Auto-add's playlists use the one AutoAddList, in a contained, scrolling box.
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import LogIn from "@lucide/svelte/icons/log-in";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import Settings from "@lucide/svelte/icons/settings";
  import { Button } from "$ui/components/ui/button/index.js";
  import Avatar from "$ui/components/Avatar.svelte";
  import FeatureIcon from "$ui/components/FeatureIcon.svelte";
  import KeyCombo from "$ui/components/KeyCombo.svelte";
  import Lazy from "$ui/components/Lazy.svelte";
  import PlaylistChooser from "$ui/components/picker/PlaylistChooser.svelte";
  import { feature, features } from "$shared/features/registry";
  import type { FeatureId } from "$shared/model/types";
  import { access, accountInView, act, labelOf, setupOf, shortcutTarget, ui } from "$lib/view.svelte";
  import { navigate, openExternal } from "$lib/nav";

  let { picked }: { picked: FeatureId[] } = $props();

  const e = $derived(ui.s.env);
  const acct = $derived(accountInView());
  const label = $derived(acct ? labelOf(acct) : null);
  const setup = $derived(setupOf(acct));
  const on = $derived(features.filter((f) => picked.includes(f.id)));
  const ready = $derived(e.access.youtube && e.youtubeOpen && e.signedIn && !!acct);
  const firstShortcut = $derived(ui.s.features.shortcuts.list[0] ?? null);
  const music = $derived(picked.includes("musicQuickActions") || picked.includes("musicShortcuts"));
  const needsPlaylist = new Set<FeatureId>(["autoAdd", "shortcuts", "quickSave", "musicQuickActions"]);
</script>

<section>
  <h1 class="text-[30px] leading-tight font-semibold tracking-[-0.022em]">Finish setting up</h1>
  <p class="text-muted-foreground mt-2 text-[15px]">
    {#if on.length}Your features are on. Some of them need a playlist for your YouTube account.
    {:else}Nothing is on yet. Switch features on any time from the toolbar icon or Settings.{/if}
  </p>

  <!-- The YouTube state comes first: everything below needs it. -->
  <div class="mt-7">
    {#if !e.access.youtube}
      <div class="border-warning-border bg-warning-soft flex flex-wrap items-center gap-3 rounded-xl border p-4">
        <TriangleAlert class="text-warning size-5 shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="text-[14.5px] font-semibold">Playlist Pigeon doesn't have access to YouTube.</p>
          <p class="text-foreground/75 text-[13.5px]">Your features stay on, but nothing runs there until you give access.</p>
        </div>
        <Button onclick={() => access.request("youtube")}>Give access to YouTube</Button>
      </div>
    {:else if !e.youtubeOpen}
      <div class="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-4">
        <span class="bg-info-soft text-info inline-flex size-9 shrink-0 items-center justify-center rounded-full"><ExternalLink class="size-[18px]" /></span>
        <div class="min-w-0 flex-1">
          <p class="text-[14.5px] font-semibold">Open YouTube to finish</p>
          <p class="text-muted-foreground text-[13.5px]">Your playlists are read from a YouTube tab, so choosing them needs one.</p>
        </div>
        <Button onclick={() => openExternal("youtube")}>Open YouTube</Button>
      </div>
    {:else if !e.signedIn}
      <div class="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-4">
        <Avatar label={null} size={36} />
        <div class="min-w-0 flex-1">
          <p class="text-[14.5px] font-semibold">You're not signed in to YouTube.</p>
          <p class="text-muted-foreground text-[13.5px]">Sign in to choose playlists. Features that need no account already work.</p>
        </div>
        <Button onclick={() => openExternal("sign-in")}><LogIn />Sign in</Button>
      </div>
    {:else if !acct}
      <div class="bg-card flex items-center gap-3 rounded-xl border p-4" aria-busy="true" aria-label="Reading which account YouTube uses">
        <span class="bg-muted size-9 animate-pulse rounded-full"></span>
        <span class="flex flex-col gap-2"><span class="bg-muted h-3 w-32 animate-pulse rounded-full"></span><span class="bg-muted h-2.5 w-20 animate-pulse rounded-full"></span></span>
      </div>
    {:else}
      <div class="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-4">
        <Avatar {label} size={40} />
        <div class="min-w-0 flex-1">
          <p class="text-muted-foreground text-[12.5px]">Setting up for the YouTube account in this browser</p>
          <p class="text-[15px] leading-6 font-semibold">{label?.name} <span class="text-muted-foreground font-normal">{label?.handle ?? ""}</span></p>
        </div>
        <button type="button" class="text-muted-foreground hover:text-foreground text-[13px] font-medium underline-offset-2 hover:underline" onclick={() => openExternal("switch-account")}>
          Not this one? Switch on YouTube
        </button>
      </div>
    {/if}
  </div>

  {#if on.length}
    <ul class="bg-card mt-4 divide-y rounded-xl border">
      {#each on as f (f.id)}
        {@const needs = needsPlaylist.has(f.id)}
        <li class="p-4">
          <div class="flex items-start gap-3.5">
            <FeatureIcon id={f.id} size={34} />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p class="text-[15px] leading-[34px] font-semibold">{feature[f.id].name}</p>
                {#if !needs || (f.id === "musicQuickActions" && !music)}
                  <span class="text-success inline-flex items-center gap-1.5 text-[13px] font-medium"><CircleCheck class="size-4" />Ready</span>
                {:else if !ready}
                  <span class="text-muted-foreground text-[13px]">Needs your YouTube account</span>
                {:else if f.id === "shortcuts" && firstShortcut && acct}
                  <span class="flex min-w-0 items-center gap-2 text-[13px]">
                    <KeyCombo key={firstShortcut.key} os={e.os} />
                    <span class="text-muted-foreground">saves to</span>
                    <PlaylistChooser
                      {acct}
                      purpose="shortcut"
                      selected={shortcutTarget(acct, firstShortcut)}
                      title="{firstShortcut.key} saves to"
                      subtitle="Watch later works on every account."
                      onchoose={(p) => act({ kind: "shortcutTarget", acct, id: firstShortcut.id, playlist: p })}
                    />
                  </span>
                {:else if f.id === "quickSave" && acct}
                  <span class="flex min-w-0 items-center gap-2 text-[13px]">
                    <span class="text-muted-foreground">One click saves to</span>
                    <PlaylistChooser
                      {acct}
                      purpose="quickSave"
                      selected={setup?.quickSave ?? null}
                      placeholder="Ask the first time"
                      title="Quick-save playlist"
                      subtitle="The save button on thumbnails adds here in one click."
                      onchoose={(p) => act({ kind: "quickSave", acct, site: "youtube", playlist: p })}
                    />
                  </span>
                {:else if f.id === "musicQuickActions" && acct}
                  <span class="flex min-w-0 items-center gap-2 text-[13px]">
                    <span class="text-muted-foreground">Save to playlist adds to</span>
                    <PlaylistChooser
                      {acct}
                      site="music"
                      purpose="musicQuickSave"
                      selected={setup?.musicQuickSave ?? null}
                      placeholder="Ask the first time"
                      title="YouTube Music quick-save playlist"
                      subtitle="Save to playlist adds songs here in one click."
                      onchoose={(p) => act({ kind: "quickSave", acct, site: "music", playlist: p })}
                    />
                  </span>
                {/if}
              </div>
              {#if f.id === "autoAdd"}
                {#if ready && acct}
                  <p class="text-muted-foreground mt-0.5 text-[13.5px]">
                    Tick the playlists it adds to for {label?.name}. A video is added once you've watched {ui.s.features.autoAdd.percent} % of it;
                    each playlist can change that later.
                  </p>
                  <div class="bg-card mt-3 max-h-[340px] overflow-y-auto overscroll-contain rounded-lg border p-2">
                    <Lazy load={() => import("$ui/components/picker/AutoAddList.svelte")} props={{ acct, density: "popup" }} />
                  </div>
                {/if}
              {:else if f.id === "musicQuickActions" && !ui.s.env.access.music}
                <p class="text-muted-foreground mt-0.5 text-[13px]">Needs access to YouTube Music. Chrome asks when you turn it on.</p>
              {/if}
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="mt-8 flex flex-wrap items-center gap-3">
    <Button size="lg" onclick={() => openExternal("youtube")}>Open YouTube<ExternalLink /></Button>
    <Button variant="outline" size="lg" onclick={() => navigate("settings")}><Settings />Open Settings</Button>
  </div>
</section>
