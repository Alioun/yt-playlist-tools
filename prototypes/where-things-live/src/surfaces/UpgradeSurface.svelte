<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 09). The one-time note for 1.4.5 upgraders, which doubles as the consent screen.
  // Auto-add and the shortcut stay paused until Agree; Agree then hands the 1.x playlists to the
  // signed-in account that owns them (ticket 11).
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import PauseCircle from "@lucide/svelte/icons/circle-pause";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import Info from "@lucide/svelte/icons/info";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import BrowserFrame from "$lib/components/BrowserFrame.svelte";
  import ConsentBlock from "./onboarding/ConsentBlock.svelte";
  import FeatureChoice from "./onboarding/FeatureChoice.svelte";
  import PrototypeNote from "./onboarding/PrototypeNote.svelte";
  import { features, type FeatureId } from "$lib/ia";
  import {
    app,
    acceptConsent,
    applyScenario,
    legacy,
    playlistsFor,
    accountName,
    extThemeClass,
    go,
    requestAccess,
  } from "$lib/state.svelte";
  import { cn } from "$lib/utils";

  const initialTicks = () =>
    Object.fromEntries(features.map((f) => [f.id, f.carriedOver])) as Record<FeatureId, boolean>;

  let ticks = $state(initialTicks());
  let outcome = $state<null | "agreed" | "later">(null);

  const kept = features.filter((f) => f.carriedOver);
  const fresh = features.filter((f) => !f.carriedOver);
  const n = $derived(features.filter((f) => ticks[f.id]).length);
  const featuresWord = (k: number) => (k === 1 ? "1 feature" : `${k} features`);

  // 1.4.5's playlist IDs, resolved against the account that owns them (fake data: Alioun).
  const owner = playlistsFor("alioun");
  const legacyTitles = legacy.autoAdd.map((id) => owner.find((p) => p.id === id)?.title).filter(Boolean) as string[];
  const legacyUnknown = legacy.autoAdd.length - legacyTitles.length;
  const legacyShortcut = owner.find((p) => p.id === legacy.shortcutTarget)?.title ?? "a playlist";

  function agree() {
    for (const f of features) app.features[f.id].on = ticks[f.id];
    acceptConsent();
    outcome = "agreed";
    // Ticket 10: on Chrome, YouTube Music access is optional and asked for from this same click.
    if (features.some((f) => f.group === "music" && ticks[f.id]) && !app.env.musicAccess) requestAccess("music");
  }

  function notNow() {
    if (app.consent !== "accepted") {
      app.consent = "pending";
      app.upgradePending = true;
    }
    outcome = "later";
  }

  function replay() {
    applyScenario("upgrade-pending");
    ticks = initialTicks();
    outcome = null;
  }

  const paused = $derived(app.consent !== "accepted");
  const url = $derived(`${app.env.browser === "firefox" ? "moz-extension" : "chrome-extension"}://…/whats-new.html`);
</script>

<div class="p-6">
  <PrototypeNote>
    <span>Opens once in a new tab after the update. To replay: Scenario › Upgraded from 1.4.5.</span>
    <button type="button" class="rounded border border-zinc-300 px-1.5 py-0.5 hover:bg-zinc-200" onclick={replay}
      >Replay as a 1.4.5 upgrader</button
    >
  </PrototypeNote>

  <BrowserFrame {url} title="Playlist Tools 2.0" bind:popupOpen={app.popupOpen} class="h-[46rem]">
    <div class={cn("absolute inset-0", extThemeClass())}>
      <div class="bg-background text-foreground h-full overflow-auto">
        <div class="mx-auto max-w-2xl space-y-6 px-6 pt-8 pb-24">
          <!-- what changed -->
          <header>
            <h1 class="text-2xl font-semibold">Playlist Tools 2.0: no Google credentials needed anymore</h1>
            <p class="text-muted-foreground mt-2 text-sm">
              2.0 works through your own YouTube session. 1.x's sign-in tokens, client ID and secret have been deleted from this
              browser.
            </p>
            <a
              href="#google-access"
              class="text-primary mt-2 inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
              onclick={(e) => e.preventDefault()}
            >
              Remove 1.x's old access from your Google account (myaccount.google.com/permissions)
              <ExternalLink class="size-3.5" />
            </a>
          </header>

          <!-- what was kept -->
          <section class="bg-card rounded-xl border p-5">
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <h2 class="text-lg font-semibold">Kept from 1.4.5</h2>
              {#if paused}
                <Badge variant="secondary" class="gap-1"><PauseCircle class="size-3" /> Paused until you agree below</Badge>
              {/if}
            </div>
            <div class="grid gap-2">
              {#each kept as f (f.id)}
                <FeatureChoice id={f.id} bind:checked={ticks[f.id]} tag="kept">
                  {#if f.id === "autoAdd"}
                    <p>Auto-add playlists: {legacyTitles.join(", ")}</p>
                    {#if legacyUnknown}
                      <p class="text-muted-foreground text-xs">
                        {legacyUnknown === 1
                          ? "1 playlist ID that doesn't match any playlist"
                          : `${legacyUnknown} playlist IDs that don't match any playlist`}
                      </p>
                    {/if}
                    <p class="text-muted-foreground text-xs">Required percentage: 50 %. Toasts: off. Your playlists take videos, not Shorts.</p>
                    <p class="text-muted-foreground text-xs">
                      Auto-add now counts only what you actually watch. Skipping ahead and ads don't count.
                    </p>
                  {:else if f.id === "shortcuts"}
                    <p>
                      <kbd class="bg-muted rounded border px-1.5 py-0.5 font-mono text-xs">Ctrl+Shift+S</kbd> saves to {legacyShortcut}
                    </p>
                    <!-- Ticket 08: Ctrl keys never fired in 1.4.5, so the note names the key and its playlist. -->
                    <p class="text-muted-foreground text-xs">This key didn't work in 1.4.5. It does now, on YouTube pages.</p>
                  {/if}
                </FeatureChoice>
              {/each}
            </div>
            <p class="text-muted-foreground mt-2 text-xs italic">Carried-over values: ticket 19.</p>
            {#if !app.env.signedIn}
              <p class="text-muted-foreground mt-2 flex items-center gap-1.5 text-sm">
                <Info class="size-4" /> Sign in to YouTube and your 1.x playlists will be picked up.
              </p>
            {/if}
          </section>

          <!-- what's new -->
          <section class="bg-card rounded-xl border p-5">
            <h2 class="text-lg font-semibold">New in 2.0</h2>
            <p class="text-muted-foreground mb-3 text-sm">All off. Tick any you want; you can change this later in Settings.</p>
            {#if app.env.browser === "chrome"}
              <p class="text-muted-foreground mb-3 text-xs">
                Chrome will ask for access to music.youtube.com when you agree, if you tick a YouTube Music feature.
              </p>
            {/if}
            <div class="grid gap-2">
              {#each fresh as f (f.id)}
                <FeatureChoice id={f.id} bind:checked={ticks[f.id]} tag="new" />
              {/each}
            </div>
          </section>

          <!-- consent -->
          {#if outcome === "agreed"}
            <section class="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-sm">
              <h2 class="mb-2 flex items-center gap-2 text-lg font-semibold">
                <CircleCheck class="size-5 text-emerald-600" /> You're all set
              </h2>
              {#if app.claimNotice}
                <p>Your auto-add playlists and shortcut from 1.x are now set up for {accountName(app.claimNotice.account)}.</p>
                {#if app.claimNotice.dropped > 0}
                  <p class="text-muted-foreground mt-1">
                    {app.claimNotice.dropped} of them weren't on this account and were left out.
                  </p>
                {/if}
              {:else if app.unclaimed && !app.env.signedIn}
                <p>Sign in to YouTube and your 1.x playlists will be picked up.</p>
              {:else if app.unclaimed}
                <p>Your playlists from 1.x belong to another YouTube account. Switch to it on YouTube to use them.</p>
              {:else}
                <p>Your features are on.</p>
              {/if}
              <div class="mt-4 flex flex-wrap gap-2">
                <Button onclick={() => go("youtube")}>Open YouTube</Button>
                <Button variant="outline" onclick={() => go("settings")}>Open Settings</Button>
              </div>
            </section>
          {:else}
            <ConsentBlock heading="Before you continue">
              {#snippet actions()}
                {#if outcome === "later"}
                  <p class="text-muted-foreground flex-1 text-sm">
                    Everything stays paused. The toolbar icon keeps a ! until you decide.
                  </p>
                  <Button onclick={agree}>{n ? `Agree and turn on ${featuresWord(n)}` : "Agree"}</Button>
                {:else}
                  <Button onclick={agree}>{n ? `Agree and turn on ${featuresWord(n)}` : "Agree"}</Button>
                  <Button variant="ghost" onclick={notNow}>Not now</Button>
                {/if}
              {/snippet}
            </ConsentBlock>
          {/if}
        </div>
      </div>
    </div>
  </BrowserFrame>
</div>
