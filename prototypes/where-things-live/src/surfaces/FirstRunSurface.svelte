<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 09). First run: pick features › consent › finish setting up.
  // Opens once in a tab on install. Nothing touches YouTube until a feature is ticked and the consent agreed.
  import Check from "@lucide/svelte/icons/check";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import LogIn from "@lucide/svelte/icons/log-in";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import BrowserFrame from "$lib/components/BrowserFrame.svelte";
  import PlaylistPicker from "$lib/components/PlaylistPicker.svelte";
  import AccountChip from "$lib/components/AccountChip.svelte";
  import ConsentBlock from "./onboarding/ConsentBlock.svelte";
  import FeatureChoice from "./onboarding/FeatureChoice.svelte";
  import PrototypeNote from "./onboarding/PrototypeNote.svelte";
  import { features, featureById, byGroup, groupLabel, type FeatureId, type Group } from "$lib/ia";
  import { accounts } from "$lib/data";
  import {
    app,
    acceptConsent,
    ensureSetup,
    playlistsFor,
    extThemeClass,
    go,
    requestAccess,
    shortcutTarget,
    setShortcutTarget as setTarget,
  } from "$lib/state.svelte";
  import { WATCH_LATER } from "$lib/data";
  import { cn } from "$lib/utils";

  const allOff = () => Object.fromEntries(features.map((f) => [f.id, false])) as Record<FeatureId, boolean>;

  let step = $state<1 | 2 | 3>(1);
  let declined = $state(false);
  let chosen = $state(allOff());

  const chosenIds = $derived(features.filter((f) => chosen[f.id]).map((f) => f.id));
  const n = $derived(chosenIds.length);
  const featuresWord = (k: number) => (k === 1 ? "1 feature" : `${k} features`);

  const musicChosen = $derived(chosenIds.some((id) => featureById[id].group === "music"));

  // ---- Settings sync at the top of step 1 (ticket 16) ----
  // First run waits up to 10 s for a synced copy; the review happens before consent, which stays this browser's own.
  /** The fake synced copy's switched-on features. */
  const syncedOn: FeatureId[] = ["autoAdd", "shortcuts", "queueButton", "musicQuickActions"];
  let syncPhase = $state<"off" | "looking" | "found">("off");
  let ownTicks: Record<FeatureId, boolean> = allOff();
  let fromSync = $state<FeatureId[]>([]);
  let syncTimer: ReturnType<typeof setTimeout> | undefined;

  function toggleSync(on: boolean) {
    clearTimeout(syncTimer);
    if (on) {
      ownTicks = { ...chosen };
      chosen.sync = true;
      syncPhase = "looking";
      syncTimer = setTimeout(() => {
        syncPhase = "found";
        for (const id of syncedOn) chosen[id] = true;
        fromSync = [...syncedOn];
      }, 1500);
    } else {
      chosen = { ...ownTicks, sync: false };
      fromSync = [];
      syncPhase = "off";
    }
  }

  function agree() {
    for (const f of features) app.features[f.id].on = chosen[f.id];
    if (chosen.sync) {
      // No join question: a fresh install has nothing of its own (ticket 16).
      app.features.sync.on = true;
      app.sync.joinedBefore = true;
    }
    acceptConsent();
    declined = false;
    step = 3;
    // Ticket 10: on Chrome, YouTube Music access is optional and asked for from this same click.
    if (musicChosen && !app.env.musicAccess) requestAccess("music");
  }

  function notNow() {
    app.consent = "declined";
    declined = true;
  }

  function restart() {
    step = 1;
    declined = false;
    clearTimeout(syncTimer);
    chosen = allOff();
    ownTicks = allOff();
    fromSync = [];
    syncPhase = "off";
  }

  // ---- step 3: YouTube status, first that applies ----
  const env = $derived(app.env);
  const status = $derived(
    !env.hostAccess ? "no-access" : !env.youtubeOpen ? "no-tab" : !env.signedIn ? "signed-out" : env.readingAccount ? "reading" : "ok",
  );
  const ready = $derived(status === "ok");
  const acc = $derived(env.account);
  const setup = $derived(app.setups[acc]);
  const firstShortcut = $derived(app.features.shortcuts.list[0]);

  // Ticket 08: turning the feature on presets Alt+W → Watch later on every account; any other pick is this account's.
  function setShortcutTarget(v: string) {
    if (!firstShortcut) return;
    setTarget(acc, firstShortcut, v || null);
  }

  function setQuickSave(v: string) {
    // "Ask each time" is the default, so choosing it creates no setup (ticket 11: nothing stored before a choice).
    if (v === "ask") {
      if (setup) setup.quickSave = null;
    } else ensureSetup(acc).quickSave = v;
  }

  // Settings sync has its own card at the top of step 1, so it's left out of the groups.
  const groups: Group[] = ["youtube", "music", "everywhere"];
  const groupFeatures = (g: Group) => byGroup(g).filter((f) => f.id !== "sync");
  const selectClass =
    "border-input bg-background h-8 min-w-48 rounded-md border px-2 text-sm disabled:opacity-50 dark:bg-input/30";
  const url = $derived(`${env.browser === "firefox" ? "moz-extension" : "chrome-extension"}://…/welcome.html`);
</script>

<div class="p-6">
  <PrototypeNote>
    <span>Opens once in a new tab after install.</span>
    <button type="button" class="rounded border border-zinc-300 px-1.5 py-0.5 hover:bg-zinc-200" onclick={restart}
      >Restart at step 1</button
    >
  </PrototypeNote>

  <BrowserFrame {url} title="Welcome to Playlist Tools" bind:popupOpen={app.popupOpen} class="h-[46rem]">
    <div class={cn("absolute inset-0", extThemeClass())}>
      <div class="bg-background text-foreground h-full overflow-auto">
        <div class="mx-auto max-w-2xl px-6 pt-8 pb-24">
          <!-- stepper -->
          <ol class="text-muted-foreground mb-6 flex items-center gap-2 text-xs">
            {#each ["Pick features", "Before you start", "Finish setting up"] as label, i (label)}
              {@const s = i + 1}
              <li class="flex items-center gap-2">
                <span
                  class={cn(
                    "flex size-5 items-center justify-center rounded-full border text-[11px]",
                    s < step && "border-primary bg-primary text-primary-foreground",
                    s === step && "border-primary text-primary font-semibold",
                  )}
                >
                  {#if s < step}<Check class="size-3" />{:else}{s}{/if}
                </span>
                <span class={cn(s === step && "text-foreground font-medium")}>{label}</span>
              </li>
              {#if s < 3}<li class="bg-border h-px w-8"></li>{/if}
            {/each}
          </ol>

          {#if step === 1}
            <h1 class="text-2xl font-semibold">What should Playlist Tools do?</h1>
            <p class="text-muted-foreground mt-1 text-sm">Tick what you want. Everything else stays off.</p>

            <!-- Settings sync (ticket 16) -->
            <section class="bg-card mt-6 rounded-xl border p-4">
              <div class="flex items-start gap-3">
                <RefreshCw class="text-primary mt-0.5 size-5 shrink-0" />
                <div class="min-w-0 flex-1">
                  <label for="first-run-sync" class="cursor-pointer font-medium">Settings sync</label>
                  <p class="text-muted-foreground text-sm">
                    Use Playlist Tools in another browser already? Turn on Settings sync to bring your settings here.
                  </p>
                </div>
                <Switch id="first-run-sync" bind:checked={() => chosen.sync, (v) => toggleSync(v)} />
              </div>
              {#if syncPhase === "looking"}
                <p class="text-muted-foreground mt-3 flex items-center gap-2 text-sm">
                  <RefreshCw class="size-3.5 animate-spin" /> Looking for your synced settings… (up to 10 s)
                </p>
              {:else if syncPhase === "found"}
                <p class="mt-3 flex items-center gap-2 text-sm">
                  <Check class="size-4 text-emerald-600" /> Found your settings from another browser. Review the features below.
                </p>
              {/if}
            </section>

            {#each groups.filter((g) => groupFeatures(g).length) as g (g)}
              <section class="mt-6">
                <h2 class="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">On {groupLabel[g]}</h2>
                {#if g === "youtube"}
                  <p class="text-muted-foreground mb-2 text-xs">
                    Pick only features that "Don't change the page" and YouTube looks exactly as before.
                  </p>
                {:else if g === "music" && env.browser === "chrome"}
                  <p class="text-muted-foreground mb-2 text-xs">Chrome will ask for access to music.youtube.com when you agree.</p>
                {/if}
                <div class="grid gap-2">
                  {#each groupFeatures(g) as f (f.id)}
                    <FeatureChoice id={f.id} bind:checked={chosen[f.id]} tag={fromSync.includes(f.id) ? "sync" : null} />
                  {/each}
                </div>
              </section>
            {/each}

            <div class="mt-8 flex flex-wrap items-center gap-3 border-t pt-4">
              <p class="text-muted-foreground flex-1 text-sm">
                Nothing changes on YouTube until you pick it. You can change this any time in Settings.
              </p>
              <Button onclick={() => (step = 2)}>
                {n ? `Continue with ${featuresWord(n)}` : "Continue without features"}
              </Button>
            </div>
          {:else if step === 2}
            {#if declined}
              <div class="bg-card rounded-xl border p-6">
                <h1 class="text-xl font-semibold">Nothing is running</h1>
                <p class="text-muted-foreground mt-1 text-sm">
                  Agree later from the toolbar icon or Settings. Until then Playlist Tools does nothing on YouTube.
                </p>
                <div class="mt-4 flex gap-2">
                  <Button variant="outline" onclick={() => (declined = false)}>Back</Button>
                </div>
              </div>
            {:else}
              <h1 class="mb-4 text-2xl font-semibold">Before you start</h1>
              <ConsentBlock heading="What Playlist Tools does with your data">
                {#snippet actions()}
                  <Button onclick={agree}>{n ? `Agree and turn on ${featuresWord(n)}` : "Agree"}</Button>
                  <Button variant="ghost" onclick={notNow}>Not now</Button>
                  <span class="flex-1"></span>
                  <Button variant="link" size="sm" onclick={() => (step = 1)}>Change features</Button>
                {/snippet}
              </ConsentBlock>
              {#if n}
                <p class="text-muted-foreground mt-3 text-xs">
                  You picked: {chosenIds.map((id) => featureById[id].name).join(", ")}.
                </p>
              {/if}
            {/if}
          {:else}
            <h1 class="text-2xl font-semibold">Finish setting up</h1>

            <!-- YouTube status -->
            <div
              class={cn(
                "mt-4 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm",
                ready ? "bg-muted/40" : "border-amber-500/40 bg-amber-500/10",
              )}
            >
              {#if status === "no-access"}
                <KeyRound class="size-4 text-amber-600" />
                <span class="flex-1">Playlist Tools doesn't have access to YouTube.</span>
                <Button size="sm" onclick={() => requestAccess("youtube")}>Give access to YouTube</Button>
              {:else if status === "no-tab"}
                <ExternalLink class="size-4 text-amber-600" />
                <span class="flex-1">Open YouTube so Playlist Tools can load your playlists.</span>
                <Button size="sm" onclick={() => (app.env.youtubeOpen = true)}>Open YouTube</Button>
              {:else if status === "signed-out"}
                <LogIn class="size-4 text-amber-600" />
                <span class="flex-1">Sign in to YouTube to choose playlists.</span>
                <Button size="sm" onclick={() => (app.env.signedIn = true)}>Sign in</Button>
              {:else if status === "reading"}
                <span class="bg-muted size-6 animate-pulse rounded-full"></span>
                <span class="bg-muted h-3 w-40 animate-pulse rounded"></span>
              {:else}
                <span class="text-muted-foreground">Signed in to YouTube as</span>
                <AccountChip account={acc} />
                <span class="text-muted-foreground text-xs">{accounts[acc].handle}</span>
              {/if}
            </div>

            {#if n === 0}
              <p class="text-muted-foreground mt-6 text-sm">
                Nothing is on yet. Turn features on any time from the toolbar icon or Settings.
              </p>
            {:else}
              <ul class="mt-6 divide-y rounded-lg border">
                {#each chosenIds as id (id)}
                  <li class="p-3">
                    <div class="flex items-center gap-2">
                      <span class="font-medium">{featureById[id].name}</span>
                      <span class="flex-1"></span>
                    </div>

                    {#if id === "autoAdd"}
                      <p class="text-muted-foreground mt-0.5 text-sm">Pick the playlists videos go to.</p>
                      {#if ready}
                        <div class="mt-2 max-w-md">
                          <PlaylistPicker
                            account={acc}
                            mode="multi"
                            maxHeight="12rem"
                            bind:selected={
                              () => app.setups[acc]?.autoAdd ?? [],
                              (v) => {
                                ensureSetup(acc).autoAdd = v;
                              }
                            }
                          />
                        </div>
                      {:else}
                        <p class="text-muted-foreground mt-1 text-sm italic">Waiting for YouTube</p>
                      {/if}
                    {:else if id === "shortcuts" && firstShortcut}
                      <label class="mt-1 flex flex-wrap items-center gap-2 text-sm">
                        <kbd class="bg-muted rounded border px-1.5 py-0.5 font-mono text-xs">{firstShortcut.key}</kbd>
                        <span>saves to</span>
                        {#if ready}
                          <select
                            class={selectClass}
                            value={shortcutTarget(acc, firstShortcut) ?? ""}
                            onchange={(e) => setShortcutTarget(e.currentTarget.value)}
                          >
                            <option value="">Choose a playlist</option>
                            {#each playlistsFor(acc) as p (p.id)}<option value={p.id}
                                >{p.id === WATCH_LATER ? "Watch later (every account)" : p.title}</option
                              >{/each}
                          </select>
                        {:else}
                          <span class="text-muted-foreground italic">Waiting for YouTube</span>
                        {/if}
                      </label>
                      <p class="text-muted-foreground mt-1 text-xs">Add more keys and labels in Settings.</p>
                    {:else if id === "quickSave"}
                      <label class="mt-1 flex flex-wrap items-center gap-2 text-sm">
                        <span>Quick-save playlist</span>
                        {#if ready}
                          <select
                            class={selectClass}
                            value={setup?.quickSave ?? "ask"}
                            onchange={(e) => setQuickSave(e.currentTarget.value)}
                          >
                            <option value="ask">None yet (the first save asks, and that pick sticks)</option>
                            {#each playlistsFor(acc) as p (p.id)}<option value={p.id}>{p.title}</option>{/each}
                          </select>
                        {:else}
                          <span class="text-muted-foreground italic">Waiting for YouTube</span>
                        {/if}
                      </label>
                    {:else if featureById[id].group === "music" && !app.env.musicAccess}
                      <p class="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
                        <KeyRound class="size-4 text-amber-600" />
                        <span class="flex-1">Needs site access</span>
                        <Button size="sm" variant="outline" onclick={() => requestAccess("music")}>Give access to YouTube Music</Button>
                      </p>
                    {:else if id === "musicQuickActions"}
                      <p class="mt-0.5 flex items-center gap-1.5 text-sm">
                        <Check class="size-4 text-emerald-600" /> Ready: Play next and Add to queue buttons. Change them in Settings.
                      </p>
                    {:else if id === "sync"}
                      <p class="mt-0.5 flex items-center gap-1.5 text-sm">
                        <Check class="size-4 text-emerald-600" /> On in this browser. Feature switches and account setups sync.
                      </p>
                    {:else}
                      <p class="mt-0.5 flex items-center gap-1.5 text-sm">
                        <Check class="size-4 text-emerald-600" /> Ready
                      </p>
                    {/if}
                  </li>
                {/each}
              </ul>
              {#if !ready && (chosen.autoAdd || chosen.shortcuts || chosen.quickSave)}
                <p class="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
                  <TriangleAlert class="size-3.5" /> Playlist choices wait for YouTube. You can also make them later from the toolbar
                  icon.
                </p>
              {/if}
            {/if}

            <div class="mt-8 flex flex-wrap gap-2 border-t pt-4">
              <Button onclick={() => go("youtube")}>Open YouTube</Button>
              <Button variant="outline" onclick={() => go("settings")}>Open Settings</Button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </BrowserFrame>
</div>
