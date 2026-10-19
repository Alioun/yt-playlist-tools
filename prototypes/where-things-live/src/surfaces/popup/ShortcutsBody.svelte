<script lang="ts">
  // Playlist shortcuts, managed in the popup too (ticket 08), so "Choose one in the popup" (ticket 11) works:
  // each shortcut's key (shared), its name, and this account's playlist for it. Add up to 20; Remove has Undo.
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Plus from "@lucide/svelte/icons/plus";
  import KeyRecorder from "$lib/components/KeyRecorder.svelte";
  import MarkNote from "./MarkNote.svelte";
  import {
    app,
    playlistsFor,
    accountName,
    shortcutTarget,
    setShortcutTarget,
    shortcutName,
    addShortcut,
    removeShortcut,
    MAX_SHORTCUTS,
    go,
  } from "$lib/state.svelte";
  import { WATCH_LATER, type AccountId } from "$lib/data";
  import { selectClass } from "./helpers";

  let { account, readonly = false }: { account: AccountId; readonly?: boolean } = $props();

  const sc = $derived(app.features.shortcuts);
  const full = $derived(sc.list.length >= MAX_SHORTCUTS);
  let justAdded = $state<string | null>(null);
  let removed = $state<{ name: string; undo: () => void } | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function remove(id: string, name: string) {
    const undo = removeShortcut(id);
    removed = { name, undo };
    clearTimeout(timer);
    timer = setTimeout(() => (removed = null), 6000);
  }

  function add() {
    const s = addShortcut();
    if (s) justAdded = s.id;
  }
</script>

<ul class="space-y-1.5">
  {#each sc.list as s (s.id)}
    <li class="space-y-1 rounded-md border p-2 text-xs">
      <div class="flex items-center gap-2">
        <span class="min-w-0 flex-1 truncate font-medium">{shortcutName(s, account)}</span>
        <button
          type="button"
          class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-0.5"
          title="Remove this shortcut"
          aria-label="Remove {shortcutName(s, account)}"
          onclick={() => remove(s.id, shortcutName(s, account))}><Trash2 class="size-3.5" /></button
        >
      </div>
      <KeyRecorder
        bind:value={s.key}
        owner={`shortcut:${s.id}`}
        site={sc.onMusic ? "both" : "youtube"}
        compact
        startRecording={justAdded === s.id}
      />
      <select
        class="{selectClass} w-full"
        disabled={readonly}
        aria-label="Playlist for {shortcutName(s, account)}"
        bind:value={() => shortcutTarget(account, s) ?? "", (v) => setShortcutTarget(account, s, v || null)}
      >
        <option value="">No playlist on {accountName(account)} yet</option>
        {#each playlistsFor(account) as p (p.id)}
          <option value={p.id}>{p.id === WATCH_LATER ? "Watch later (every account)" : p.title}</option>
        {/each}
      </select>
      <MarkNote {account} playlistId={shortcutTarget(account, s)} {readonly} />
    </li>
  {/each}
</ul>

{#if removed}
  <p class="bg-muted mt-1.5 flex items-center gap-2 rounded-md px-2 py-1 text-xs">
    <span class="flex-1">Removed {removed.name}.</span>
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

<button
  type="button"
  class="text-primary mt-1.5 flex items-center gap-1 text-xs font-medium hover:underline disabled:text-muted-foreground disabled:no-underline"
  disabled={full}
  onclick={add}><Plus class="size-3.5" /> Add shortcut</button
>
{#if full}<p class="text-muted-foreground text-xs">You can have up to 20 playlist shortcuts.</p>{/if}

<p class="text-muted-foreground mt-1.5 text-xs">
  {sc.pickerKey || "No key"} opens the playlist picker · {app.undoKey || "No key"} undoes the last save ·
  <button type="button" class="text-primary hover:underline" onclick={() => go("settings")}>Change keys in Settings</button>
</p>
