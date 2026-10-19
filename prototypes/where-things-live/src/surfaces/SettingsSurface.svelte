<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 09). The settings page: the home of every feature.
  // Each feature is one row with its switch; switching it on unfolds its settings right there.
  // Playlist choices are per account (ticket 11); everything else is shared.
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import * as RadioGroup from "$lib/components/ui/radio-group/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import BrowserFrame from "$lib/components/BrowserFrame.svelte";
  import AccountChip from "$lib/components/AccountChip.svelte";
  import PlaylistPicker from "$lib/components/PlaylistPicker.svelte";
  import { byGroup } from "$lib/ia";
  import { accounts, type AccountId } from "$lib/data";
  import {
    app,
    go,
    extThemeClass,
    settingsAccount,
    popupAccount,
    accountsWithSetup,
    accountName,
    ensureSetup,
    setupReadOnly,
    requestAccess,
    removeKeptFilters,
  } from "$lib/state.svelte";
  import { cn } from "$lib/utils";
  import FeatureCard from "./settings/FeatureCard.svelte";
  import OptionSwitch from "./settings/OptionSwitch.svelte";
  import AutoAddBody from "./settings/AutoAddBody.svelte";
  import ShortcutsBody from "./settings/ShortcutsBody.svelte";
  import MusicSection from "./settings/MusicSection.svelte";
  import AccountsSection from "./settings/AccountsSection.svelte";
  import PrivacySection from "./settings/PrivacySection.svelte";

  const nav = [
    { id: "youtube", label: "YouTube" },
    { id: "music", label: "YouTube Music" },
    { id: "everywhere", label: "Everywhere" },
    { id: "accounts", label: "Accounts" },
    { id: "appearance", label: "Appearance" },
    { id: "privacy", label: "Privacy & data" },
    { id: "diagnostics", label: "Diagnostics" },
    { id: "about", label: "About" },
  ];

  // Ticket 18: Diagnostics is loaded only when shown (its own chunk).
  let diagEl: HTMLElement | undefined = $state();
  let diagShown = $state(false);
  $effect(() => {
    if (!diagEl || !scroller || diagShown) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          diagShown = true;
          io.disconnect();
        }
      },
      { root: scroller, rootMargin: "200px" },
    );
    io.observe(diagEl);
    return () => io.disconnect();
  });

  const url = $derived(`${app.env.browser === "firefox" ? "moz-extension" : "chrome-extension"}://…/settings.html`);
  const acct = $derived(settingsAccount());
  const name = $derived(accountName(acct));
  const setup = $derived(app.setups[acct]);

  /** The picker lists accounts with a setup, plus the popup's current account if it has none yet. */
  const pickable = $derived.by(() => {
    const list = accountsWithSetup();
    const cur = popupAccount();
    return cur && !list.includes(cur) ? [cur, ...list] : list;
  });
  const showPicker = $derived(accountsWithSetup().length >= 2);

  const musicFeatureOn = $derived(
    app.sites.music && (app.features.musicQuickActions.on || app.features.musicShortcuts.on || app.features.shortcuts.onMusic),
  );

  const strip = $derived.by(() => {
    if (app.consent !== "accepted")
      return {
        text: "Nothing runs until you agree.",
        action: "Review",
        run: () => go(app.upgradePending ? "upgrade" : "first-run"),
      };
    if (!app.env.hostAccess)
      return {
        text: "Playlist Tools doesn't have access to YouTube.",
        action: "Give access to YouTube",
        run: () => requestAccess("youtube"),
      };
    if (!app.env.musicAccess && musicFeatureOn)
      return {
        text: "Playlist Tools doesn't have access to YouTube Music.",
        action: "Give access to YouTube Music",
        run: () => requestAccess("music"),
      };
    if (!app.env.youtubeOpen)
      return {
        text: `No YouTube tab is open, so playlists are saved data from ${app.env.cachedAgo}.`,
        action: "Open YouTube",
        run: () => (app.env.youtubeOpen = true),
      };
    if (app.env.privateWindow) return { text: "Private window: account setups are read-only here.", action: "", run: () => {} };
    return null;
  });

  let scroller: HTMLDivElement | undefined = $state();
  let active = $state("youtube");

  // Keep the clicked section highlighted while the jump scrolls (the last sections can't reach the top).
  let jumping = 0;
  function jump(id: string) {
    active = id;
    jumping = Date.now();
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onscroll() {
    if (!scroller || Date.now() - jumping < 1000) return;
    const top = scroller.getBoundingClientRect().top;
    let current = nav[0].id;
    for (const n of nav) {
      const el = document.getElementById(`settings-${n.id}`);
      if (el && el.getBoundingClientRect().top - top < 120) current = n.id;
    }
    active = current;
  }

  function setQuickSave(v: string) {
    if (v === "ask") {
      if (setup) setup.quickSave = null;
      return;
    }
    ensureSetup(acct).quickSave = v;
  }
</script>

<div class="h-full p-6 pb-20">
  <BrowserFrame {url} title="Playlist Tools · Settings" bind:popupOpen={app.popupOpen} class="h-full min-h-[36rem]">
    <div class={cn("absolute inset-0", extThemeClass())}>
      <div bind:this={scroller} {onscroll} class="bg-background text-foreground h-full overflow-auto">
        {#if strip}
          <div
            class="sticky top-0 z-20 flex items-center gap-3 border-b border-amber-500/30 bg-amber-50 px-6 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
          >
            <TriangleAlert class="size-4 shrink-0" />
            <span class="flex-1">{strip.text}</span>
            {#if strip.action}<Button size="sm" variant="outline" onclick={strip.run}>{strip.action}</Button>{/if}
          </div>
        {/if}

        <div class="mx-auto flex max-w-5xl gap-8 px-6 py-6">
          <nav class="sticky top-14 hidden w-44 shrink-0 self-start md:block">
            <p class="mb-3 flex items-center gap-2 text-sm font-semibold">
              <span class="bg-primary text-primary-foreground inline-flex size-6 items-center justify-center rounded-md text-[10px] font-bold"
                >PT</span
              >
              Playlist Tools
            </p>
            <ul class="space-y-0.5 text-sm">
              {#each nav as n (n.id)}
                <li>
                  <button
                    type="button"
                    class={cn(
                      "w-full rounded-md px-2 py-1.5 text-left",
                      active === n.id ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-accent/60",
                    )}
                    onclick={() => jump(n.id)}>{n.label}</button
                  >
                </li>
              {/each}
            </ul>
          </nav>

          <div class="min-w-0 max-w-3xl flex-1 space-y-10 pb-24">
            <!-- page header -->
            <header class="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
              <div>
                <h1 class="text-2xl font-semibold">Settings</h1>
                <p class="text-muted-foreground text-sm">Switch features on and off. Off leaves nothing on YouTube's pages.</p>
              </div>
              <div class="text-right">
                {#if showPicker}
                  <p class="text-muted-foreground mb-1 text-xs">Showing setup for</p>
                  <Select.Root
                    type="single"
                    value={acct}
                    onValueChange={(v) => (app.settingsAccount = v as AccountId)}
                  >
                    <Select.Trigger class="h-auto min-w-52 py-1.5">
                      <AccountChip account={acct} />
                      <span class="text-muted-foreground text-xs">{accounts[acct].handle}</span>
                    </Select.Trigger>
                    <Select.Content>
                      {#each pickable as a (a)}
                        <Select.Item value={a} label={accounts[a].name}>
                          {accounts[a].name}
                          <span class="text-muted-foreground text-xs"
                            >{accounts[a].handle}{app.setups[a] ? "" : " · no setup yet"}</span
                          >
                        </Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                {:else}
                  <p class="text-muted-foreground mb-1 text-xs">Playlists shown for</p>
                  <span class="inline-flex items-center gap-2">
                    <AccountChip account={acct} />
                    <span class="text-muted-foreground text-xs">{accounts[acct].handle}</span>
                  </span>
                {/if}
              </div>
            </header>

            <!-- YouTube -->
            <section id="settings-youtube" class="scroll-mt-16 space-y-3">
              <h2 class="text-lg font-semibold">YouTube</h2>
              {#each byGroup("youtube") as f (f.id)}
                <FeatureCard id={f.id}>
                  {#if f.id === "autoAdd"}
                    <AutoAddBody account={acct} />
                  {:else if f.id === "shortcuts"}
                    <ShortcutsBody account={acct} />
                  {:else if f.id === "quickSave"}
                    <div>
                      <h4 class="mb-1.5 text-sm font-medium">Quick-save playlist for {name}</h4>
                      <PlaylistPicker
                        account={acct}
                        mode="single"
                        allowAsk
                        readonly={setupReadOnly() || !app.env.youtubeOpen}
                        maxHeight="12rem"
                        bind:value={() => setup?.quickSave ?? "ask", setQuickSave}
                      />
                    </div>
                    <div class="border-t pt-2">
                      <OptionSwitch label="Also on Shorts shelves" bind:checked={app.features.quickSave.onShorts} />
                      <OptionSwitch label="Show feedback" hint="Failures always show." bind:checked={app.features.quickSave.toast} />
                    </div>
                  {:else if f.id === "queueButton"}
                    <p class="text-muted-foreground text-sm">Works without signing in. The button shows a tick when the video is queued.</p>
                    <OptionSwitch label="Also show a toast" hint="Failures always show." bind:checked={app.features.queueButton.toast} />
                  {:else if f.id === "watchButton"}
                    <p class="text-muted-foreground text-sm">
                      Under the video, after YouTube's Save: this video's auto-add status, Save to…, and this channel's filter.
                    </p>
                    <OptionSwitch label="Also on Shorts" hint="In the Shorts action column." bind:checked={app.features.watchButton.onShorts} />
                  {:else if f.id === "cardMenu"}
                    <OptionSwitch
                      label="Links inside cards keep the browser's menu"
                      hint="Such as the channel name, so you can still open it in a new tab."
                      bind:checked={app.features.cardMenu.linksKeepBrowserMenu}
                    />
                    <p class="text-muted-foreground text-xs">Shift + right-click always gives the browser's menu.</p>
                  {/if}
                </FeatureCard>
              {/each}
            </section>

            <!-- YouTube Music -->
            <section id="settings-music" class="scroll-mt-16 space-y-3">
              <h2 class="text-lg font-semibold">YouTube Music</h2>
              <MusicSection account={acct} />
            </section>

            <!-- Everywhere -->
            <section id="settings-everywhere" class="scroll-mt-16 space-y-3">
              <h2 class="text-lg font-semibold">Everywhere</h2>
              <FeatureCard id="sync">
                <p class="text-muted-foreground text-sm">
                  Uses {app.env.browser === "firefox" ? "Firefox's" : "Chrome's"} own sync. Your settings reach your other browsers
                  only if you're signed in to the browser and it syncs extensions{app.env.browser === "firefox"
                    ? " (Add-ons in Firefox Sync)"
                    : ""}.
                </p>
                <p class="text-muted-foreground text-sm">
                  Synced: feature switches, keys, labels and account setups. This switch, site access and caches stay in each
                  browser.
                </p>
                {#if app.sync.status === "full"}
                  <div class="flex flex-wrap items-center gap-3 border-t pt-3">
                    <Button size="sm" variant="outline" onclick={removeKeptFilters}>Remove kept filters</Button>
                    <span class="text-muted-foreground text-xs">Filters of playlists you no longer auto-add to</span>
                  </div>
                {/if}
              </FeatureCard>
              <!-- Ticket 08: the manifest declares the popup command with no key; the browser's own settings bind it. -->
              <div class="bg-card rounded-xl border p-4 text-sm">
                Open this popup with a key:
                <a href="#browser-shortcuts" class="text-primary inline-flex items-center gap-1 hover:underline"
                  >set one in your browser's shortcut settings <ExternalLink class="size-3" /></a
                >
              </div>
            </section>

            <!-- Accounts -->
            <section id="settings-accounts" class="scroll-mt-16 space-y-3">
              <h2 class="text-lg font-semibold">Accounts</h2>
              <AccountsSection />
            </section>

            <!-- Appearance -->
            <section id="settings-appearance" class="scroll-mt-16 space-y-3">
              <h2 class="text-lg font-semibold">Appearance</h2>
              <div class="bg-card rounded-xl border p-4">
                <RadioGroup.Root bind:value={app.theme} class="flex gap-6">
                  <label class="flex items-center gap-2 text-sm"><RadioGroup.Item value="light" /> Light</label>
                  <label class="flex items-center gap-2 text-sm"><RadioGroup.Item value="dark" /> Dark</label>
                  <label class="flex items-center gap-2 text-sm"><RadioGroup.Item value="system" /> System</label>
                </RadioGroup.Root>
                <p class="text-muted-foreground mt-2 text-xs">
                  For the popup, Settings and first run. Controls inside YouTube follow YouTube's own theme.
                </p>
              </div>
            </section>

            <!-- Privacy & data -->
            <section id="settings-privacy" class="scroll-mt-16 space-y-3">
              <h2 class="text-lg font-semibold">Privacy & data</h2>
              <PrivacySection />
            </section>

            <!-- Diagnostics (ticket 18), loaded only when shown -->
            <section id="settings-diagnostics" bind:this={diagEl} class="min-h-32 scroll-mt-16 space-y-3">
              <h2 class="text-lg font-semibold">Diagnostics</h2>
              {#if diagShown}
                {#await import("./settings/DiagnosticsSection.svelte") then { default: DiagnosticsSection }}
                  <DiagnosticsSection />
                {/await}
              {/if}
            </section>

            <!-- About -->
            <section id="settings-about" class="scroll-mt-16 space-y-3">
              <h2 class="text-lg font-semibold">About</h2>
              <div class="bg-card space-y-2 rounded-xl border p-4 text-sm">
                <p class="font-medium">Playlist Tools 2.0.0</p>
                <p class="flex flex-wrap gap-4">
                  <a href="#whats-new" class="text-primary inline-flex items-center gap-1 hover:underline"
                    >What's new <ExternalLink class="size-3" /></a
                  >
                  <a href="#privacy-policy" class="text-primary inline-flex items-center gap-1 hover:underline"
                    >Privacy policy <ExternalLink class="size-3" /></a
                  >
                  <a href="#report" class="text-primary inline-flex items-center gap-1 hover:underline"
                    >Report a problem <ExternalLink class="size-3" /></a
                  >
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  </BrowserFrame>
</div>
