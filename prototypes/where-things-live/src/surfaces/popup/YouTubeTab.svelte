<script lang="ts">
  // The popup's YouTube tab: This video, then each YouTube feature as a row; per-account choices sit inside.
  import PlaylistPicker from "$lib/components/PlaylistPicker.svelte";
  import ShortcutsBody from "./ShortcutsBody.svelte";
  import FeatureRow from "./FeatureRow.svelte";
  import ThisVideo from "./ThisVideo.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import PlaylistOptions from "./PlaylistOptions.svelte";
  import MarkNote from "./MarkNote.svelte";
  import RecentAdds from "./RecentAdds.svelte";
  import {
    app,
    popupAccount,
    ensureSetup,
    setupReadOnly,
    playlistTitle,
    playlistsFor,
    accountName,
    optionsFor,
    togglePause,
    shortcutTarget,
    go,
  } from "$lib/state.svelte";
  import { WATCH_LATER } from "$lib/data";
  import { optionsPill, sectionLabel, selectClass } from "./helpers";

  const account = $derived(popupAccount());
  const setup = $derived(account ? app.setups[account] : null);
  /** Cached, read-only lists: private window (ticket 11) or no YouTube tab (ticket 02). */
  const readonly = $derived(setupReadOnly() || !app.env.youtubeOpen);
  /** Watch pages, Shorts, and YouTube's home while the miniplayer plays (ticket 07: it still counts). */
  const showVideo = $derived(
    app.env.activeSite === "youtube" &&
      (app.env.ytPage === "watch" || app.env.ytPage === "shorts" || (app.env.ytPage === "home" && app.env.miniplayer)) &&
      app.env.youtubeOpen &&
      app.env.signedIn &&
      !app.env.readingAccount,
  );

  let editing = $state<string | null>(null);

  const autoAddSummary = $derived(
    app.autoAddPaused
      ? "Paused until you resume or restart the browser"
      : account && app.notLoaded[account]
        ? // Ticket 16: a setup that came by sync, for an account this browser hasn't loaded playlists for yet.
          `${setup?.autoAdd.length ?? 0} auto-add playlist${setup?.autoAdd.length === 1 ? "" : "s"} · Open YouTube as ${accountName(account)} to see them`
        : `${setup?.autoAdd.length ?? 0} playlist${setup?.autoAdd.length === 1 ? "" : "s"} · adds at ${app.features.autoAdd.threshold} %`,
  );
  /** From storage, for the first view: "Alt+W → Watch later, Alt+K → All-time favourites". */
  const shortcutSummary = $derived(
    app.features.shortcuts.list
      .filter((s) => s.key)
      .map((s) => {
        const t = account ? shortcutTarget(account, s) : null;
        return `${s.key} → ${t === WATCH_LATER ? "Watch later" : t ? playlistTitle(t, account!) : "no playlist yet"}`;
      })
      .join(", ") || "No keys yet",
  );
</script>

{#if showVideo}<ThisVideo />{/if}

{#if app.env.activeSite === "other" && app.env.youtubeOpen}
  <p class="text-muted-foreground mb-1 text-xs">Using your open YouTube tab.</p>
{/if}

<p class="{sectionLabel} mt-1">YouTube features</p>

{#snippet needsAccount()}
  {#if app.env.readingAccount}
    <div class="space-y-1.5">
      <div class="bg-muted h-3 w-2/3 animate-pulse rounded"></div>
      <div class="bg-muted h-3 w-1/2 animate-pulse rounded"></div>
    </div>
  {:else}
    <p class="text-muted-foreground text-xs">Sign in to YouTube to choose playlists, or pick an account with a setup above.</p>
  {/if}
{/snippet}

<FeatureRow id="autoAdd" summary={autoAddSummary}>
  {#snippet aside()}
    <Button
      size="xs"
      variant={app.autoAddPaused ? "default" : "outline"}
      title={app.autoAddPaused ? "Resume auto-add in every tab" : "Pause auto-add in every tab until you resume or restart the browser"}
      onclick={togglePause}>{app.autoAddPaused ? "Resume" : "Pause"}</Button
    >
  {/snippet}
  {#if !account || app.env.readingAccount}
    {@render needsAccount()}
  {:else}
    <p class="text-muted-foreground mb-1 text-xs">Auto-add playlists for {accountName(account)}</p>
    {#if !setup}
      <p class="mb-1.5 text-xs">Nothing is set up for {accountName(account)} yet. Ticking a playlist starts its setup.</p>
    {/if}
    <PlaylistPicker
      {account}
      mode="multi"
      {readonly}
      maxHeight="14rem"
      bind:selected={
        () => setup?.autoAdd ?? [],
        (v) => {
          ensureSetup(account).autoAdd = v;
        }
      }
    >
      {#snippet rowExtra(p)}
        {#if setup?.autoAdd.includes(p.id)}
          <button
            type="button"
            class="border-input hover:bg-background shrink-0 rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap"
            onclick={() => (editing = editing === p.id ? null : p.id)}
            aria-expanded={editing === p.id}
            title="This playlist's options: what it takes, its percentage, its channel filter"
            >{optionsPill(optionsFor(p.id, account), setup?.filters[p.id])}</button
          >
        {/if}
      {/snippet}
    </PlaylistPicker>
    {#if editing && setup?.autoAdd.includes(editing)}
      <PlaylistOptions {account} playlistId={editing} {readonly} onclose={() => (editing = null)} />
    {/if}
  {/if}
</FeatureRow>

<FeatureRow id="shortcuts" summary={shortcutSummary}>
  {#if !account || app.env.readingAccount}
    {@render needsAccount()}
  {:else}
    <ShortcutsBody {account} {readonly} />
  {/if}
</FeatureRow>

<FeatureRow
  id="quickSave"
  summary={account && setup?.quickSave ? `Saves to ${playlistTitle(setup.quickSave, account)}` : "The next save asks where to"}
>
  {#if account && !app.env.readingAccount}
    <label class="flex items-center gap-2 text-xs">
      <span class="text-muted-foreground shrink-0">Quick-save playlist</span>
      <select
        class={selectClass}
        disabled={readonly}
        bind:value={
          () => setup?.quickSave ?? "",
          (v) => {
            ensureSetup(account).quickSave = v || null;
          }
        }
      >
        <option value="">None yet (the next save asks)</option>
        {#each playlistsFor(account) as p (p.id)}<option value={p.id}>{p.title}</option>{/each}
      </select>
    </label>
    <MarkNote {account} playlistId={setup?.quickSave} {readonly} />
  {/if}
</FeatureRow>

<FeatureRow id="queueButton" summary="On thumbnails, top-left on hover" />
<FeatureRow id="watchButton" summary="Under the video, after YouTube's Save" />
<FeatureRow id="cardMenu" summary="Shift + right-click keeps the browser's menu" />

<RecentAdds />
