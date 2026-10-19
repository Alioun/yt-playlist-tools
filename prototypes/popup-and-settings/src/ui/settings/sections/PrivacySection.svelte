<script lang="ts">
  import "../settings-more.css";
  // Settings › Privacy & data: the one consent (ticket 19 §4.3: read it again, or withdraw), what's kept here, 1.x's
  // Google access, and Clear all data (ticket 16 §9.1: this browser; the synced copy only if ticked).
  import ShieldCheck from "@lucide/svelte/icons/shield-check";
  import ShieldAlert from "@lucide/svelte/icons/shield-alert";
  import Database from "@lucide/svelte/icons/database";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import Eraser from "@lucide/svelte/icons/eraser";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import { Button } from "$ui/components/ui/button/index.js";
  import { Checkbox } from "$ui/components/ui/checkbox/index.js";
  import Disclosure from "$ui/components/Disclosure.svelte";
  import SectionHeader from "../parts/SectionHeader.svelte";
  import SettingsDialog from "../parts/SettingsDialog.svelte";
  import { act, call, ui } from "$lib/view.svelte";
  import { navigate, openExternal } from "$lib/nav";

  const agreed = $derived(ui.s.consent === "accepted");
  const showSyncBox = $derived(ui.s.sync.on || ui.s.sync.joinedBefore);
  let reading = $state(false);
  let withdrawing = $state(false);
  let clearing = $state(false);
  let alsoSynced = $state(false);
  let busy = $state(false);
  let cleared = $state(false);

  async function clear() {
    busy = true;
    await call("clearAll", { alsoSynced: showSyncBox && alsoSynced });
    busy = false;
    clearing = false;
    cleared = true;
  }
</script>

{#snippet card(Icon: typeof ShieldCheck, title: string, tone: "plain" | "attention" | "danger")}
  <span
    class="inline-flex size-[38px] shrink-0 items-center justify-center rounded-[10px]
      {tone === 'attention' ? 'bg-warning-soft text-warning' : tone === 'danger' ? 'bg-destructive-soft text-destructive' : 'bg-muted text-muted-foreground'}"
    ><Icon class="size-5" /></span
  >
  <h3 class="sr-only">{title}</h3>
{/snippet}

<SectionHeader
  title="Privacy & data"
  description="Playlist Pigeon keeps everything in this browser and talks only to YouTube. Nothing is sent to us."
/>

<div class="space-y-4">
  {#if cleared}
    <div class="border-success/30 bg-success-soft flex items-center gap-3 rounded-2xl border px-5 py-4">
      <CircleCheck class="text-success size-5 shrink-0" />
      <div class="min-w-0 flex-1 text-sm">
        <p class="font-medium">Everything is cleared in this browser.</p>
        <p class="text-foreground/75">Playlist Pigeon starts again as if just installed. Nothing runs until you set it up.</p>
      </div>
      <Button onclick={() => navigate("onboarding")}>Set up again</Button>
    </div>
  {/if}

  <section class="bg-card shadow-soft flex items-start gap-4 rounded-2xl border px-5 py-4">
    {@render card(agreed ? ShieldCheck : ShieldAlert, "Your OK", agreed ? "plain" : "attention")}
    <div class="min-w-0 flex-1">
      <h3 class="text-[15px] leading-6 font-semibold">Your OK</h3>
      {#if agreed}
        <p class="text-muted-foreground text-[13.5px] leading-5">
          You agreed on {ui.s.consentAt}. It covers what every feature you switch on reads and changes, in this browser.
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onclick={() => (reading = true)}>Read it again</Button>
          <Button size="sm" variant="ghost" onclick={() => (withdrawing = true)}>Withdraw and pause everything</Button>
        </div>
      {:else}
        <p class="text-muted-foreground text-[13.5px] leading-5">
          You haven't agreed yet, so nothing runs on YouTube. Switching a feature on asks first.
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onclick={() => navigate("onboarding")}>Review and agree</Button>
          <Button size="sm" variant="outline" onclick={() => (reading = true)}>Read what it covers</Button>
        </div>
      {/if}
    </div>
  </section>

  <section class="bg-card shadow-soft flex items-start gap-4 rounded-2xl border px-5 py-4">
    {@render card(Database, "What's kept in this browser", "plain")}
    <div class="min-w-0 flex-1">
      <h3 class="text-[15px] leading-6 font-semibold">What's kept in this browser</h3>
      <ul class="text-muted-foreground mt-1 grid gap-x-8 gap-y-1 text-[13.5px] leading-5 sm:grid-cols-2">
        <li>Your features, keys and options</li>
        <li>Each account's setup and its name, @handle and picture</li>
        <li>A list of each account's playlists, refreshed every few minutes</li>
        <li>How much of each video you've watched, for up to 30 days</li>
      </ul>
      <p class="text-muted-foreground mt-2 text-[13px] leading-5">
        {ui.s.sync.on
          ? `Settings sync is on: your settings and account setups also travel through ${ui.s.env.browser === "firefox" ? "Firefox's" : "Chrome's"} own sync. Watch progress and cached playlists never do.`
          : "Settings sync is off, so none of it leaves this browser."}
      </p>
    </div>
  </section>

  <section class="bg-card shadow-soft flex items-start gap-4 rounded-2xl border px-5 py-4">
    {@render card(KeyRound, "Google access from 1.x", "plain")}
    <div class="min-w-0 flex-1">
      <h3 class="text-[15px] leading-6 font-semibold">Google access from 1.x</h3>
      <p class="text-muted-foreground text-[13.5px] leading-5">
        2.0 needs no Google credentials. If you used 1.x, its client ID, secret and tokens are already deleted from this browser; you can also remove
        its access from your Google account. If you made a Google Cloud project just for 1.x, you can delete that too.
      </p>
      <Button class="mt-3" size="sm" variant="outline" onclick={() => openExternal("google-permissions")}>Remove 1.x's access from your Google account <ExternalLink /></Button>
    </div>
  </section>

  <section class="bg-card shadow-soft flex items-start gap-4 rounded-2xl border px-5 py-4">
    {@render card(Eraser, "Clear all data", "danger")}
    <div class="min-w-0 flex-1">
      <h3 class="text-[15px] leading-6 font-semibold">Clear all data</h3>
      <p class="text-muted-foreground text-[13.5px] leading-5">
        Resets Playlist Pigeon in this browser, as if just installed. {showSyncBox ? "Your other browsers keep their settings unless you choose otherwise." : ""}
        Your playlists on YouTube aren't touched.
      </p>
      <Button class="mt-3" size="sm" variant="destructive-soft" onclick={() => (clearing = true)}>Clear all data…</Button>
    </div>
  </section>
</div>

<SettingsDialog bind:open={reading} title={agreed ? "What you agreed to" : "Before anything can run"} width="lg">
  <Disclosure browser={ui.s.env.browser} />
  {#snippet footer()}
    {#if agreed}
      <Button variant="outline" onclick={() => (reading = false)}>Close</Button>
    {:else}
      <Button variant="outline" onclick={() => (reading = false)}>Not now</Button>
      <Button
        onclick={() => {
          act({ kind: "consent", accepted: true });
          reading = false;
        }}>Agree</Button
      >
    {/if}
  {/snippet}
</SettingsDialog>

<SettingsDialog
  bind:open={withdrawing}
  title="Withdraw your consent?"
  description="Every feature stops in this browser and nothing is read from YouTube until you agree again. Your settings are kept."
  width="sm"
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (withdrawing = false)}>Cancel</Button>
    <Button
      variant="destructive"
      onclick={() => {
        act({ kind: "consent", accepted: false });
        withdrawing = false;
      }}>Withdraw</Button
    >
  {/snippet}
</SettingsDialog>

<SettingsDialog bind:open={clearing} title="Clear all data?" width="md" onclose={() => (alsoSynced = false)}>
  <p class="text-foreground/80 text-sm leading-6">
    Playlist Pigeon forgets everything it keeps in this browser: features, shortcuts, account setups, channel filters, cached playlists and watch
    progress. It starts again as if just installed. Your playlists on YouTube aren't touched.
  </p>
  {#if showSyncBox}
    <label class="hover:bg-muted/50 mt-4 flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3">
      <Checkbox class="mt-0.5" checked={alsoSynced} onCheckedChange={(v) => (alsoSynced = !!v)} />
      <span>
        <span class="block text-sm font-medium">Also delete synced settings from all your browsers</span>
        <span class="text-muted-foreground block text-[13px] leading-5">
          Every browser that syncs your settings is reset too. Left unticked, they keep theirs and this browser stops syncing.
        </span>
      </span>
    </label>
  {/if}
  {#snippet footer()}
    <Button variant="outline" onclick={() => (clearing = false)}>Cancel</Button>
    <Button variant="destructive" disabled={busy} onclick={clear}>
      {#if busy}<LoaderCircle class="animate-spin" />{/if}{showSyncBox && alsoSynced ? "Clear here and everywhere" : "Clear"}
    </Button>
  {/snippet}
</SettingsDialog>
