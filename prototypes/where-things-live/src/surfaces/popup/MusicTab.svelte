<script lang="ts">
  // The popup's YouTube Music tab: the section switch, Playing now, the two YouTube Music features,
  // the quick-save playlist (once, under whichever feature is on) and playlist shortcuts there.
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Kbd } from "$lib/components/ui/kbd/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import FeatureRow from "./FeatureRow.svelte";
  import PlayingNow from "./PlayingNow.svelte";
  import {
    app,
    popupAccount,
    ensureSetup,
    setupReadOnly,
    playlistsFor,
    accountName,
    blockReason,
    requestAccess,
    shortcutName,
    go,
  } from "$lib/state.svelte";
  import MarkNote from "./MarkNote.svelte";
  import { musicButtons, musicKeyNames, type MusicKeyAction } from "$lib/ia";
  import { cn } from "$lib/utils";
  import { sectionLabel, selectClass } from "./helpers";

  const account = $derived(popupAccount());
  const setup = $derived(account ? app.setups[account] : null);
  const qa = $derived(app.features.musicQuickActions);
  const ks = $derived(app.features.musicShortcuts);
  const anyOn = $derived(qa.on || ks.on);
  const blocked = $derived(blockReason("musicQuickActions"));
  const showPlaying = $derived(app.env.musicOpen && !blocked && anyOn && !app.env.readingAccount);
  /** The quick-save playlist shows once, under whichever feature is on (ticket 26). */
  const quickSaveUnder = $derived(qa.on ? "musicQuickActions" : ks.on ? "musicShortcuts" : null);
  const keyOrder: MusicKeyAction[] = ["playNext", "addToQueue", "save", "savePicker", "like", "remove"];
</script>

<label class="mb-2 flex cursor-pointer items-start gap-3 rounded-lg border p-2.5">
  <span class="min-w-0 flex-1">
    <span class="block text-sm font-medium">YouTube Music</span>
    <span class="text-muted-foreground block text-xs">Off: nothing runs on music.youtube.com. Your choices are kept.</span>
  </span>
  <Switch
    bind:checked={
      () => app.sites.music,
      (v) => {
        // Turning the section on from a click asks for YouTube Music site access if a feature in it is on (ticket 10).
        if (v && anyOn) requestAccess("music", () => (app.sites.music = true));
        else app.sites.music = v;
      }
    }
    aria-label="YouTube Music"
    class="mt-0.5"
  />
</label>

{#if app.sites.music}
  {#if app.env.installedApp}
    <p class="text-muted-foreground mb-2 text-xs">You're in the YouTube Music app. Settings open in your browser.</p>
  {/if}

  {#if showPlaying}<PlayingNow />{/if}

  {#snippet quickSave()}
    {#if account}
      <label class="mt-2 flex items-center gap-2 text-xs">
        <span class="text-muted-foreground shrink-0">Quick-save playlist for {accountName(account)}</span>
        <select
          class={selectClass}
          disabled={setupReadOnly()}
          bind:value={
            () => setup?.musicQuickSave ?? "",
            (v) => {
              ensureSetup(account).musicQuickSave = v || null;
            }
          }
        >
          <option value="">None yet (the next save asks)</option>
          {#each playlistsFor(account) as p (p.id)}<option value={p.id}>{p.title}</option>{/each}
        </select>
      </label>
      <MarkNote {account} playlistId={setup?.musicQuickSave} readonly={setupReadOnly()} />
    {/if}
  {/snippet}

  <p class="{sectionLabel} mt-1">YouTube Music features</p>

  <FeatureRow
    id="musicQuickActions"
    summary={musicButtons
      .filter((b) => qa.buttons[b.id])
      .map((b) => b.name)
      .join(", ") || "No buttons picked"}
  >
    <div class="flex flex-wrap gap-1">
      {#each musicButtons as b (b.id)}
        <button
          type="button"
          aria-pressed={qa.buttons[b.id]}
          title={b.where}
          class={cn(
            "rounded-full border px-2 py-0.5 text-xs",
            qa.buttons[b.id] ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-muted",
          )}
          onclick={() => (qa.buttons[b.id] = !qa.buttons[b.id])}>{b.name}</button
        >
      {/each}
    </div>
    <label class="mt-2 flex items-center gap-2 text-xs">
      <Checkbox bind:checked={app.features.musicQuickActions.playerBarSave} />
      Save on the player bar, beside YouTube Music's like button
    </label>
    {#if quickSaveUnder === "musicQuickActions"}{@render quickSave()}{/if}
  </FeatureRow>

  <FeatureRow id="musicShortcuts" summary="Act on the song under the pointer, else the one playing">
    <ul class="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-xs">
      {#each keyOrder as k (k)}
        <li class="contents">
          <span>{#if ks.keys[k]}<Kbd>{ks.keys[k]}</Kbd>{:else}<span class="text-muted-foreground">No key</span>{/if}</span>
          <span class="truncate">{musicKeyNames[k]}</span>
        </li>
      {/each}
    </ul>
    <button type="button" class="text-primary mt-1.5 text-xs hover:underline" onclick={() => go("settings")}>
      Change keys in Settings
    </button>
    {#if quickSaveUnder === "musicShortcuts"}{@render quickSave()}{/if}
  </FeatureRow>

  <div class="py-2.5">
    {#if app.features.shortcuts.on}
      <div class="flex items-start gap-3">
        <span class="min-w-0 flex-1">
          <label class="block text-sm font-medium" for="switch-shortcuts-music">Playlist shortcuts work here too</label>
          <span class="text-muted-foreground block text-xs">
            {app.features.shortcuts.list
              .filter((s) => s.key)
              .map((s) => `${s.key} ${account ? shortcutName(s, account) : s.label || ""}`.trim())
              .join(" · ") || "No keys yet"}
          </span>
          {#if app.features.shortcuts.onMusic && !app.env.musicAccess}
            <!-- Ticket 08: shown here only; it never raises the toolbar badge. -->
            <span class="mt-1 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
              Needs access to YouTube Music
              <Button size="xs" variant="outline" onclick={() => requestAccess("music")}>Give access</Button>
            </span>
          {/if}
        </span>
        <Switch
          id="switch-shortcuts-music"
          bind:checked={app.features.shortcuts.onMusic}
          aria-label="Playlist shortcuts on YouTube Music"
          class="mt-0.5"
        />
      </div>
    {:else}
      <p class="text-muted-foreground text-xs">Turn on playlist shortcuts on the YouTube tab to use them here.</p>
    {/if}
  </div>
{/if}
