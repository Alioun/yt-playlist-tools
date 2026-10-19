<script lang="ts">
  import "../settings-more.css";
  // Settings › Everywhere: settings sync (ticket 16) and the browser's own key for opening the popup (ticket 08).
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Keyboard from "@lucide/svelte/icons/keyboard";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import { Button } from "$ui/components/ui/button/index.js";
  import FeatureCard from "../parts/FeatureCard.svelte";
  import Callout from "../parts/Callout.svelte";
  import SectionHeader from "../parts/SectionHeader.svelte";
  import SettingsDialog from "../parts/SettingsDialog.svelte";
  import { act, call, ui } from "$lib/view.svelte";
  import { openExternal } from "$lib/nav";

  const sync = $derived(ui.s.sync);
  const firefox = $derived(ui.s.env.browser === "firefox");
  let join = $state(false);
  let joining = $state<null | "synced" | "local">(null);

  function toggle(on: boolean) {
    if (on && sync.remoteHasSettings) {
      join = true;
      return;
    }
    act({ kind: "sync", on });
  }
  async function answer(choice: "synced" | "local" | "cancel") {
    if (choice !== "cancel") {
      joining = choice;
      await call("syncJoin", { choice });
      joining = null;
    }
    join = false;
  }
</script>

<SectionHeader title="Everywhere" description="Settings that apply to the whole browser, on both sites." />

<div class="space-y-4">
  <FeatureCard
    anchor="feature-sync"
    name="Settings sync"
    blurb="Keeps your settings the same in every browser where you turn it on."
    footprint="none"
    on={sync.on}
    ontoggle={toggle}
  >
    {#snippet icon()}
      <span class="inline-flex size-[38px] shrink-0 items-center justify-center rounded-[10px] {sync.on ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground'}"
        ><RefreshCw class="size-5" /></span
      >
    {/snippet}
    {#snippet note()}
      <p class="text-muted-foreground mt-2 max-w-[62ch] text-[13px] leading-5">
        Uses {firefox ? "Firefox's" : "Chrome's"} own sync. Your settings reach your other browsers only if you're signed in to the browser and it
        syncs extensions{firefox ? " (Add-ons in Firefox Sync)" : ""}.
      </p>
    {/snippet}
    <div class="space-y-3 px-5 py-4">
      {#if sync.status === "looking"}
        <p class="flex items-center gap-2 text-sm"><LoaderCircle class="text-muted-foreground size-4 animate-spin" />Looking for synced settings from your other browsers…</p>
      {:else if sync.status === "full"}
        <Callout tone="attention" title="Synced settings are full">
          {sync.largest}: remove some, or turn off sync in this browser to keep more here. Changes that need more room aren't saved until then.
          {#snippet actions()}
            <Button size="sm" onclick={() => act({ kind: "removeKeptFilters" })}>Remove kept filters</Button>
            <span class="text-muted-foreground text-[13px]">Filters of playlists you no longer auto-add to</span>
          {/snippet}
        </Callout>
      {:else if sync.status === "update"}
        <Callout tone="attention" title="Update Playlist Pigeon in this browser to keep syncing.">
          Another browser saved settings with a newer version. This browser keeps its settings and stops sending the ones it can't read yet.
          Extensions update within a day; {firefox ? "about:addons" : "chrome://extensions"} can check now.
        </Callout>
      {:else}
        <p class="text-success flex items-center gap-2 text-sm"><CircleCheck class="size-4" />Synced {sync.lastSynced}.</p>
      {/if}
      <div class="text-muted-foreground grid gap-x-8 gap-y-1 text-[13px] leading-5 sm:grid-cols-2">
        <p><span class="text-foreground font-medium">Syncs:</span> feature switches and options, shortcuts and their keys, the theme, and each account's setup.</p>
        <p><span class="text-foreground font-medium">Stays here:</span> your OK, this switch, cached playlists and watch progress.</p>
      </div>
      <p class="text-muted-foreground text-[13px] leading-5">Turning sync off deletes nothing, here or in your other browsers.</p>
    </div>
  </FeatureCard>

  <section class="bg-card shadow-soft flex items-start gap-4 rounded-2xl border px-5 py-4">
    <span class="bg-muted text-muted-foreground inline-flex size-[38px] shrink-0 items-center justify-center rounded-[10px]"><Keyboard class="size-5" /></span>
    <div class="min-w-0 flex-1">
      <h3 class="text-[15px] leading-6 font-semibold">A key to open this popup</h3>
      <p class="text-muted-foreground text-[13.5px] leading-5">
        Your browser can open Playlist Pigeon's popup from any tab with a key you choose. It's set in the browser's own shortcut settings:
        {firefox ? "about:addons, then ⚙ › Manage Extension Shortcuts" : "chrome://extensions/shortcuts"}.
      </p>
    </div>
    <Button size="sm" variant="outline" onclick={() => openExternal("browser-shortcuts")}>Open shortcut settings <ExternalLink /></Button>
  </section>
</div>

<SettingsDialog bind:open={join} title="Use synced settings?" description="This browser and your synced settings both have a setup. Pick which one to keep." width="lg" onclose={() => (joining = null)}>
  <div class="space-y-2.5">
    <button
      type="button"
      class="hover:bg-muted/60 border-primary/40 bg-accent/40 flex w-full items-start gap-3 rounded-xl border p-3.5 text-left"
      disabled={!!joining}
      onclick={() => answer("synced")}
    >
      <span class="border-primary mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border-2"><span class="bg-primary size-1.5 rounded-full"></span></span>
      <span>
        <span class="block text-sm font-semibold">Use synced settings <span class="text-muted-foreground font-normal">(recommended)</span></span>
        <span class="text-muted-foreground block text-[13px] leading-5">They replace this browser's. Account setups only this browser has are added to them.</span>
      </span>
      {#if joining === "synced"}<LoaderCircle class="ml-auto size-4 animate-spin" />{/if}
    </button>
    <button
      type="button"
      class="hover:bg-muted/60 flex w-full items-start gap-3 rounded-xl border p-3.5 text-left"
      disabled={!!joining}
      onclick={() => answer("local")}
    >
      <span class="border-input mt-0.5 inline-flex size-4 shrink-0 rounded-full border-2"></span>
      <span>
        <span class="block text-sm font-semibold">Use this browser's settings</span>
        <span class="text-muted-foreground block text-[13px] leading-5">They replace the synced ones in every browser. Setups only the synced copy has are added here.</span>
      </span>
      {#if joining === "local"}<LoaderCircle class="ml-auto size-4 animate-spin" />{/if}
    </button>
    <p class="text-muted-foreground pt-1 text-[13px]">Either way, nothing is lost for an account only one side has.</p>
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => answer("cancel")}>Cancel</Button>
  {/snippet}
</SettingsDialog>
