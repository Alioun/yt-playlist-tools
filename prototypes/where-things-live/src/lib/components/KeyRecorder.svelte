<script lang="ts">
  // Ticket 08's recorder, shared by the popup and Settings (ticket 15 draws the final one).
  // Idle: the key with Change and Clear, or "No key" with Set key. Recording: Esc and Tab cancel, a click elsewhere
  // cancels, Enter/Space alone and Ctrl+Alt are refused with a hint. A key used elsewhere on the same site asks
  // "Use it here" or Cancel. Clash warnings with YouTube, YouTube Music or the browser stay under the row.
  import { onMount } from "svelte";
  import X from "@lucide/svelte/icons/x";
  import { keyOwners, type KeySite } from "$lib/state.svelte";
  import { cn } from "$lib/utils";

  let {
    value = $bindable(""),
    owner,
    site,
    compact = false,
    startRecording = false,
  }: {
    value?: string;
    /** This key's owner id in keyOwners(), so it isn't reported as clashing with itself. */
    owner: string;
    site: KeySite;
    compact?: boolean;
    /** Ticket 08: Add shortcut starts recording at once. */
    startRecording?: boolean;
  } = $props();

  let recording = $state(false);
  onMount(() => {
    if (startRecording) recording = true;
  });
  let hint = $state<string | null>(null);
  let pending = $state<{ key: string; other: { name: string; clear: () => void } } | null>(null);
  let box: HTMLButtonElement | undefined = $state();

  $effect(() => {
    if (recording) box?.focus();
  });

  const overlaps = (a: KeySite, b: KeySite) => a === "both" || b === "both" || a === b;

  const NAMES: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    PageUp: "Page Up",
    PageDown: "Page Down",
    " ": "Space",
  };

  function onkeydown(e: KeyboardEvent) {
    if (!recording) return;
    if (e.key === "Tab") {
      recording = false;
      hint = null;
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      recording = false;
      hint = null;
      return;
    }
    if (["Control", "Alt", "Shift", "Meta", "AltGraph", "Dead", "Process"].includes(e.key) || e.isComposing) return;
    const mods = (e.ctrlKey ? 1 : 0) + (e.altKey ? 1 : 0) + (e.shiftKey ? 1 : 0) + (e.metaKey ? 1 : 0);
    if ((e.key === "Enter" || e.key === " ") && mods === 0) {
      hint = "Enter and Space can't be used alone: they press buttons.";
      return;
    }
    if (e.ctrlKey && e.altKey) {
      hint = "Ctrl+Alt can't be used: many keyboards type characters with it.";
      return;
    }
    const keyLabel = NAMES[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
    const combo = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Win", keyLabel].filter(Boolean).join("+");
    const other = keyOwners().find((o) => o.id !== owner && o.key === combo && overlaps(o.site, site));
    recording = false;
    hint = null;
    if (other) pending = { key: combo, other };
    else value = combo;
  }

  function useItHere() {
    if (!pending) return;
    pending.other.clear();
    value = pending.key;
    pending = null;
  }

  /** Ticket 08's clash warnings: the key is kept, the note stays until it changes. */
  const warning = $derived.by(() => {
    if (!value) return null;
    const bare = !value.includes("+");
    const yt: Record<string, string> = { K: "Play/pause", J: "Rewind 10 seconds", L: "Forward 10 seconds", F: "Fullscreen", M: "Mute", C: "Captions", T: "Theater mode", I: "Miniplayer" };
    const ytm: Record<string, string> = { Q: "Toggle queue", J: "Previous song", K: "Next song", L: "Seek forward", M: "Mute", S: "Shuffle", R: "Repeat" };
    if (bare && site !== "music" && yt[value]) return `YouTube uses ${value} for ${yt[value]}. This shortcut replaces it on YouTube.`;
    if (bare && site !== "youtube" && ytm[value]) return `YouTube Music uses ${value} for ${ytm[value]}. This shortcut replaces it on YouTube Music.`;
    const browser: Record<string, string> = { "Alt+D": "go to the address bar", "Ctrl+D": "bookmark the page", "Ctrl+S": "save the page", "Ctrl+F": "find in page" };
    if (browser[value]) return `The browser uses ${value} to ${browser[value]}. This shortcut replaces it on YouTube pages.`;
    return null;
  });

  const btn = "rounded px-1.5 py-0.5 text-xs hover:bg-accent";
</script>

<div class="min-w-0">
  <div class="flex items-center gap-1">
    {#if recording}
      <button
        type="button"
        bind:this={box}
        class={cn("border-primary bg-primary/10 text-primary animate-pulse rounded border border-dashed px-2 py-0.5 text-xs", compact && "max-w-44 truncate")}
        {onkeydown}
        onblur={() => {
          recording = false;
          hint = null;
        }}>Press a key combination… (Esc to cancel)</button
      >
    {:else if value}
      <kbd class="bg-muted rounded border px-1.5 py-0.5 font-mono text-xs whitespace-nowrap">{value}</kbd>
      <button type="button" class={btn} onclick={() => (recording = true)}>Change</button>
      <button type="button" class="hover:bg-accent rounded p-0.5" title="Clear key" aria-label="Clear key" onclick={() => (value = "")}
        ><X class="size-3" /></button
      >
    {:else}
      <span class="text-muted-foreground text-xs">No key</span>
      <button type="button" class={btn} onclick={() => (recording = true)}>Set key</button>
    {/if}
  </div>
  {#if hint}<p class="text-muted-foreground mt-0.5 text-xs">{hint}</p>{/if}
  {#if pending}
    <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
      <span>{pending.key} is already used by {pending.other.name}.</span>
      <button type="button" class="bg-primary text-primary-foreground rounded px-1.5 py-0.5" onclick={useItHere}>Use it here</button>
      <button type="button" class={btn} onclick={() => (pending = null)}>Cancel</button>
    </div>
  {/if}
  {#if warning && !recording}<p class="mt-0.5 text-xs text-amber-700 dark:text-amber-400">{warning}</p>{/if}
</div>
