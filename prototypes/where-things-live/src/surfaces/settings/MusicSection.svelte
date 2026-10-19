<script lang="ts">
  // The YouTube Music section: its own switch (map Q20–Q21), then its two features (ticket 26).
  import Switch from "./Toggle.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { musicButtons, musicKeyNames, type MusicKeyAction } from "$lib/ia";
  import { app, ensureSetup, setupReadOnly, accountName, removeChosenPlaylist, requestAccess } from "$lib/state.svelte";
  import type { AccountId } from "$lib/data";
  import FeatureCard from "./FeatureCard.svelte";
  import OptionSwitch from "./OptionSwitch.svelte";
  import KeyRecorder from "$lib/components/KeyRecorder.svelte";
  import PlaylistSelect from "./PlaylistSelect.svelte";

  let { account }: { account: AccountId } = $props();

  const name = $derived(accountName(account));
  const setup = $derived(app.setups[account]);
  const qa = $derived(app.features.musicQuickActions);
  const keyIds = Object.keys(musicKeyNames) as MusicKeyAction[];

  function setMusicQuickSave(v: string | null) {
    if (v === null) {
      if (setup) setup.musicQuickSave = null;
      return;
    }
    ensureSetup(account).musicQuickSave = v;
  }
</script>

{#snippet quickSavePlaylist()}
  <div class="border-t pt-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p class="text-sm">Quick-save playlist for {name}</p>
        <p class="text-muted-foreground text-xs">
          Used by Save to playlist and its key. YouTube Music's own, separate from YouTube's quick-save.
        </p>
      </div>
      <div class="text-right">
        <PlaylistSelect
          {account}
          value={setup?.musicQuickSave ?? null}
          onchange={setMusicQuickSave}
          placeholder="None yet (the next save asks)"
          noneLabel="None yet (the next save asks)"
          disabled={setupReadOnly()}
        />
        {#if setup?.musicQuickSave && app.marks[setup.musicQuickSave]}
          <p class="text-destructive mt-1 text-xs font-medium">
            {app.marks[setup.musicQuickSave] === "full" ? "Full" : "Missing"} ·
            <button
              type="button"
              class="underline-offset-2 hover:underline"
              onclick={() => removeChosenPlaylist(account, setup!.musicQuickSave!)}>Remove</button
            >
          </p>
        {/if}
      </div>
    </div>
  </div>
{/snippet}

<div class="bg-card flex items-start gap-4 rounded-xl border p-4">
  <div class="min-w-0 flex-1">
    <label for="site-music" class="font-medium">YouTube Music</label>
    <p class="text-muted-foreground text-sm">
      {#if app.sites.music}
        Everything Playlist Tools does on music.youtube.com. Off stops all of it at once.
      {:else}
        Nothing runs on music.youtube.com. Your choices below are kept.
      {/if}
    </p>
    {#if !app.env.musicAccess}
      <p class="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
        Needs site access ·
        <button type="button" class="underline underline-offset-2" onclick={() => requestAccess("music")}
          >Give access to YouTube Music</button
        >
      </p>
    {/if}
  </div>
  <Switch id="site-music" class="mt-1" bind:checked={app.sites.music} />
</div>

{#if app.sites.music}
  <div class="space-y-3 border-l-2 pl-4">
    <FeatureCard id="musicQuickActions">
      <div>
        <h4 class="mb-1 text-sm font-medium">Buttons</h4>
        <div class="space-y-2">
          {#each musicButtons as b (b.id)}
            <label class="flex items-start gap-2 text-sm">
              <Checkbox class="mt-0.5" bind:checked={qa.buttons[b.id]} />
              <span>{b.name} <span class="text-muted-foreground block text-xs">{b.where}</span></span>
            </label>
          {/each}
          <label class="flex items-start gap-2 text-sm">
            <Checkbox class="mt-0.5" bind:checked={qa.playerBarSave} />
            <span
              >Save on the player bar <span class="text-muted-foreground block text-xs"
                >Beside YouTube Music's own like button, only where there's a player bar</span
              ></span
            >
          </label>
        </div>
      </div>
      <div class="border-t pt-2">
        <OptionSwitch
          label="Show feedback"
          hint="Failures always show, even with this off."
          bind:checked={app.features.musicQuickActions.toast}
        />
      </div>
      {@render quickSavePlaylist()}
    </FeatureCard>

    <FeatureCard id="musicShortcuts">
      <p class="text-muted-foreground text-xs">
        A key acts on the song under the pointer, else the one playing. Every Alt combination is free on YouTube Music.
      </p>
      <div class="divide-y rounded-lg border">
        {#each keyIds as k (k)}
          <div class="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
            <span class="text-sm">{musicKeyNames[k]}</span>
            <KeyRecorder bind:value={app.features.musicShortcuts.keys[k]} owner="music:{k}" site="music" />
          </div>
        {/each}
        <div class="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
          <span class="text-sm"
            >Undo the toast on screen <span class="text-muted-foreground text-xs">(shared with playlist shortcuts)</span></span
          >
          <KeyRecorder bind:value={app.undoKey} owner="undo" site="both" />
        </div>
      </div>
      <div class="border-t pt-2">
        <OptionSwitch label="Show feedback" hint="Failures always show." bind:checked={app.features.musicShortcuts.toast} />
      </div>
      {#if !qa.on}{@render quickSavePlaylist()}{/if}
    </FeatureCard>

    <div class="flex items-start gap-4 rounded-xl border border-dashed p-4">
      <div class="min-w-0 flex-1">
        <label for="music-shortcuts" class="text-sm font-medium">Playlist shortcuts here too</label>
        <p class="text-muted-foreground text-xs">
          {#if app.features.shortcuts.on}
            Your playlist shortcuts from the YouTube section also work on YouTube Music.
          {:else}
            Turn on Playlist shortcuts in the YouTube section first.
          {/if}
        </p>
      </div>
      <Switch
        id="music-shortcuts"
        size="sm"
        class="mt-1"
        disabled={!app.features.shortcuts.on}
        bind:checked={app.features.shortcuts.onMusic}
      />
    </div>

    <p class="text-muted-foreground text-xs">Works the same in the installed YouTube Music app.</p>
  </div>
{/if}
