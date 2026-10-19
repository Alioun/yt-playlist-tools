<script lang="ts">
  // Playlist shortcuts (tickets 08, 11): keys and labels are shared; each account picks its own playlist,
  // except Watch later, which applies on every account without its own choice.
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Plus from "@lucide/svelte/icons/plus";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import KeyRecorder from "$lib/components/KeyRecorder.svelte";
  import {
    app,
    setupReadOnly,
    accountName,
    removeChosenPlaylist,
    shortcutTarget,
    setShortcutTarget,
    shortcutName,
    addShortcut,
    removeShortcut,
    playlistTitle,
    requestAccess,
    MAX_SHORTCUTS,
  } from "$lib/state.svelte";
  import { WATCH_LATER, type AccountId } from "$lib/data";
  import PlaylistSelect from "./PlaylistSelect.svelte";
  import OptionSwitch from "./OptionSwitch.svelte";

  let { account }: { account: AccountId } = $props();

  const name = $derived(accountName(account));
  const list = $derived(app.features.shortcuts.list);
  const atLimit = $derived(list.length >= MAX_SHORTCUTS);
  const site = $derived(app.features.shortcuts.onMusic ? "both" : "youtube");

  let justAdded = $state<string | null>(null);
  let removed = $state<{ name: string; undo: () => void } | null>(null);
  let removedTimer: ReturnType<typeof setTimeout> | undefined;

  function remove(id: string) {
    const s = list.find((x) => x.id === id);
    if (!s) return;
    const n = shortcutName(s, account);
    const undo = removeShortcut(id);
    removed = { name: n, undo };
    clearTimeout(removedTimer);
    removedTimer = setTimeout(() => (removed = null), 6000);
  }

  function add() {
    const s = addShortcut();
    if (s) justAdded = s.id;
  }

  const wlLabel = (id: string, title: string) => (id === WATCH_LATER ? "Watch later (every account)" : title);
</script>

<p class="text-muted-foreground text-xs">
  Keys and labels are shared by all your accounts. Each account picks its own playlist; Watch later applies on every account
  that hasn't picked one.
</p>

<div class="divide-y rounded-lg border">
  <div class="text-muted-foreground grid grid-cols-[9rem_1fr_15rem_2rem] gap-2 px-3 py-1.5 text-[11px] uppercase">
    <span>Label</span><span>Key</span><span>Playlist for {name}</span><span></span>
  </div>
  {#each list as s (s.id)}
    {@const target = shortcutTarget(account, s)}
    {@const mark = target ? app.marks[target] : undefined}
    <div class="grid grid-cols-[9rem_1fr_15rem_2rem] items-start gap-2 px-3 py-2">
      <Input
        class="h-7 text-xs"
        maxlength={40}
        placeholder={target ? playlistTitle(target, account) : "Label (optional)"}
        bind:value={s.label}
        onblur={() => (s.label = s.label.trim())}
      />
      <KeyRecorder bind:value={s.key} owner="shortcut:{s.id}" {site} startRecording={justAdded === s.id} />
      <div class="min-w-0">
        <PlaylistSelect
          {account}
          value={target}
          onchange={(v) => setShortcutTarget(account, s, v)}
          placeholder="No playlist on {name} yet"
          labelFor={wlLabel}
          disabled={setupReadOnly()}
        />
        {#if mark && target}
          <p class="text-destructive mt-1 text-xs font-medium">
            {mark === "full" ? "Full" : "Missing"}
            {#if !setupReadOnly()}
              ·
              <button type="button" class="underline-offset-2 hover:underline" onclick={() => removeChosenPlaylist(account, target)}
                >Remove</button
              >
            {/if}
          </p>
        {/if}
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="Remove shortcut {shortcutName(s, account)}" onclick={() => remove(s.id)}>
        <Trash2 />
      </Button>
    </div>
  {:else}
    <p class="text-muted-foreground px-3 py-3 text-xs">No shortcuts yet.</p>
  {/each}
</div>

{#if removed}
  <p class="text-sm" role="status">
    Removed {removed.name}.
    <button
      type="button"
      class="text-primary font-medium hover:underline"
      onclick={() => {
        removed?.undo();
        removed = null;
      }}>Undo</button
    >
  </p>
{/if}

<div class="flex flex-wrap items-center gap-3">
  <Button variant="outline" size="sm" onclick={add} disabled={atLimit}>
    <Plus /> Add shortcut
  </Button>
  {#if atLimit}<span class="text-muted-foreground text-xs">You can have up to {MAX_SHORTCUTS} playlist shortcuts.</span>{/if}
</div>

<div class="divide-y rounded-lg border">
  <div class="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
    <span class="text-sm">Open the playlist picker</span>
    <KeyRecorder bind:value={app.features.shortcuts.pickerKey} owner="picker" site="youtube" />
  </div>
  <div class="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
    <span class="text-sm">Undo the toast on screen</span>
    <KeyRecorder bind:value={app.undoKey} owner="undo" site="both" />
  </div>
</div>

<p class="text-muted-foreground text-xs">
  Shortcuts work while a YouTube or YouTube Music page is in focus. If one does nothing, the browser or another extension may
  be using that key.
</p>

<div class="border-t pt-2">
  <OptionSwitch
    label="Also works on YouTube Music"
    hint="Acts on the song under the pointer, else the one playing."
    bind:checked={app.features.shortcuts.onMusic}
  />
  {#if app.features.shortcuts.onMusic && !app.env.musicAccess}
    <p class="mb-1 text-xs font-medium text-amber-700 dark:text-amber-400">
      Needs access to YouTube Music ·
      <button type="button" class="underline underline-offset-2" onclick={() => requestAccess("music")}>Give access</button>
    </p>
  {/if}
  <OptionSwitch label="Show feedback" hint="Failures always show." bind:checked={app.features.shortcuts.toast} />
</div>
