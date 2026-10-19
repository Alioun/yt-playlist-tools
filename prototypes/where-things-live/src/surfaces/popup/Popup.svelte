<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 09). The toolbar popup: "this tab, this account, right now".
  // Header › one banner (most urgent first) › YouTube | YouTube Music tabs › All settings.
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import Info from "@lucide/svelte/icons/info";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import PopupHeader from "./PopupHeader.svelte";
  import YouTubeTab from "./YouTubeTab.svelte";
  import MusicTab from "./MusicTab.svelte";
  import CircleX from "@lucide/svelte/icons/circle-x";
  import {
    app,
    go,
    popupAccount,
    accountName,
    claimLegacy,
    discardLegacy,
    playlistsFor,
    requestAccess,
    breakageStrip,
    brokenFeatures,
    openDiagnostics,
    syncStatusLine,
  } from "$lib/state.svelte";
  import { cn } from "$lib/utils";

  const strip = $derived(breakageStrip());
  const stripBroken = $derived(brokenFeatures().length > 0);

  const musicFeatureOn = $derived(app.features.musicQuickActions.on || app.features.musicShortcuts.on);

  // Preselect the tab of the site you're on; elsewhere keep the last one used.
  let tab = $state<"youtube" | "music">(app.env.activeSite === "music" ? "music" : "youtube");
  $effect(() => {
    const s = app.env.activeSite;
    if (s === "music" || s === "youtube") tab = s;
  });

  type Banner = {
    tone: "warn" | "info" | "ok";
    text: string;
    more?: string;
    actions: { label: string; run: () => void; primary?: boolean }[];
  };

  const banner = $derived.by((): Banner | null => {
    const e = app.env;
    const shown = popupAccount();
    if (app.consent !== "accepted" && app.upgradePending)
      return {
        tone: "warn",
        text: "Playlist Tools 2.0 is paused until you OK it. No Google credentials needed anymore.",
        actions: [{ label: "Review", run: () => go("upgrade"), primary: true }],
      };
    if (app.consent !== "accepted")
      return {
        tone: "warn",
        text: "Waiting for your OK. Nothing runs on YouTube until you agree.",
        actions: [{ label: "Review", run: () => go("first-run"), primary: true }],
      };
    if (app.remoteResetNotice)
      return {
        tone: "info",
        text: "Your synced settings were deleted in another browser, so Playlist Tools was reset here.",
        actions: [{ label: "OK", run: () => (app.remoteResetNotice = false), primary: true }],
      };
    if (tab === "youtube" && !e.hostAccess)
      return {
        tone: "warn",
        text: "Playlist Tools doesn't have access to YouTube.",
        actions: [{ label: "Give access to YouTube", run: () => requestAccess("youtube"), primary: true }],
      };
    if (tab === "music" && !e.musicAccess && (app.sites.music || musicFeatureOn))
      return {
        tone: "warn",
        text: "Playlist Tools doesn't have access to YouTube Music.",
        actions: [{ label: "Give access to YouTube Music", run: () => requestAccess("music"), primary: true }],
      };
    if (e.staleTab)
      return {
        tone: "warn",
        text: "Your YouTube account changed in another tab. Reload this page to keep saving here.",
        actions: [{ label: "Reload tab", run: () => (e.staleTab = false), primary: true }],
      };
    if (!e.signedIn && !e.readingAccount)
      return {
        tone: "info",
        text: "You're not signed in to YouTube in this tab.",
        actions: [{ label: "Sign in", run: () => (e.signedIn = true), primary: true }],
      };
    if (e.privateWindow && shown)
      return {
        tone: "info",
        text: app.setups[shown]
          ? `Private window: ${accountName(shown)}'s setup is in use. You can change it only in a normal window.`
          : `${accountName(shown)} has no setup yet. Private windows don't save anything, so set it up in a normal window.`,
        actions: [],
      };
    if (tab === "youtube" && !e.youtubeOpen)
      return {
        tone: "info",
        text: `No YouTube tab is open, so this is saved data from ${e.cachedAgo}.`,
        actions: [{ label: "Open YouTube", run: () => (e.youtubeOpen = true), primary: true }],
      };
    if (tab === "music" && !e.musicOpen)
      return {
        tone: "info",
        text: "No YouTube Music tab is open. Quick actions work only inside one.",
        actions: [{ label: "Open YouTube Music", run: () => (e.musicOpen = true), primary: true }],
      };
    if (app.popupAccount && app.popupAccount !== e.account)
      return {
        tone: "info",
        text: `${accountName(app.popupAccount)} isn't open in any tab. Open YouTube and switch to this account to refresh its playlists.`,
        actions: [],
      };
    if (app.unclaimed && e.signedIn) {
      const owned = new Set(playlistsFor(e.account).map((p) => p.id));
      const ownsAny = app.unclaimed.autoAdd.some((p) => owned.has(p)) || owned.has(app.unclaimed.shortcutTarget);
      if (!ownsAny)
        return {
          tone: "warn",
          text: `Your playlists from 1.x belong to another YouTube account. Switch to it on YouTube to use them, or set up ${accountName(e.account)} below.`,
          actions: [
            {
              label: "Switch account",
              // Stands in for YouTube's /channel_switcher page; switching is YouTube's job, never ours.
              run: () => {
                e.account = "alioun";
                claimLegacy("alioun");
              },
              primary: true,
            },
            { label: "Discard", run: () => discardLegacy() },
          ],
        };
    }
    // Ticket 16: sync has no row in the first view, so a sync problem reaches the popup as a banner.
    const sync = syncStatusLine();
    if (sync?.problem)
      return { tone: "warn", text: sync.text, actions: [{ label: "Details", run: () => go("settings"), primary: true }] };
    const marked = Object.keys(app.marks).length;
    if (marked)
      return {
        tone: "warn",
        text: `${marked === 1 ? "A playlist you chose needs" : `${marked} playlists you chose need`} attention. ${marked === 1 ? "It's" : "They're"} marked Missing or Full below, with Remove.`,
        actions: [],
      };
    if (app.claimNotice)
      return {
        tone: "ok",
        text: `Your auto-add playlists and shortcut from 1.x are now set up for ${accountName(app.claimNotice.account)}.`,
        more:
          app.claimNotice.dropped > 0
            ? `${app.claimNotice.dropped} of them ${app.claimNotice.dropped === 1 ? "wasn't" : "weren't"} on this account and ${app.claimNotice.dropped === 1 ? "was" : "were"} left out.`
            : undefined,
        actions: [{ label: "OK", run: () => (app.claimNotice = null), primary: true }],
      };
    return null;
  });
</script>

<div class="bg-background text-foreground flex max-h-[600px] w-[360px] flex-col overflow-hidden rounded-lg border text-sm shadow-2xl">
  <PopupHeader />

  {#if strip}
    <!-- Ticket 18: what isn't working in this tab, above the one banner. -->
    <div
      class={cn(
        "flex items-center gap-2 border-b px-3 py-1.5 text-xs",
        stripBroken ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-900 dark:text-amber-200",
      )}
      role="status"
    >
      {#if stripBroken}<CircleX class="size-4 shrink-0" />{:else}<TriangleAlert class="size-4 shrink-0" />{/if}
      <span class="min-w-0 flex-1">{strip}</span>
      <Button size="xs" variant="outline" onclick={openDiagnostics}>Details</Button>
    </div>
  {/if}

  {#if banner}
    <div
      role="status"
      class={cn(
        "flex gap-2 border-b px-3 py-2 text-xs",
        banner.tone === "warn" && "bg-amber-500/10 text-amber-900 dark:text-amber-200",
        banner.tone === "info" && "bg-sky-500/10 text-sky-900 dark:text-sky-200",
        banner.tone === "ok" && "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
      )}
    >
      {#if banner.tone === "warn"}<TriangleAlert class="mt-0.5 size-4 shrink-0" />
      {:else if banner.tone === "ok"}<CircleCheck class="mt-0.5 size-4 shrink-0" />
      {:else}<Info class="mt-0.5 size-4 shrink-0" />{/if}
      <div class="min-w-0 flex-1">
        <p>{banner.text}</p>
        {#if banner.more}<p class="mt-0.5 opacity-80">{banner.more}</p>{/if}
        {#if banner.actions.length}
          <div class="mt-1.5 flex flex-wrap gap-1.5">
            {#each banner.actions as a (a.label)}
              <Button size="xs" variant={a.primary ? "default" : "outline"} onclick={a.run}>{a.label}</Button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <Tabs.Root bind:value={tab} class="flex min-h-0 flex-1 flex-col gap-0">
    <div class="px-3 pt-2">
      <Tabs.List class="w-full">
        <Tabs.Trigger value="youtube">YouTube</Tabs.Trigger>
        <Tabs.Trigger value="music">YouTube Music</Tabs.Trigger>
      </Tabs.List>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-2">
      <Tabs.Content value="youtube"><YouTubeTab /></Tabs.Content>
      <Tabs.Content value="music"><MusicTab /></Tabs.Content>
    </div>
  </Tabs.Root>

  <div class="flex items-center justify-between border-t px-3 py-2 text-xs">
    <span class="text-muted-foreground">Switches here are the same as in Settings.</span>
    <button type="button" class="text-primary font-medium hover:underline" onclick={() => go("settings")}>All settings</button>
  </div>
</div>
