<script lang="ts">
  // One playlist picker for every place a playlist is chosen: Watch Later first, search, membership,
  // and "New playlist" at the end (creating playlists is offered wherever a playlist is picked).
  // skin="ext" is the extension's own design system; skin="yt" is the low-fi YouTube look for in-page menus.
  import type { Snippet } from "svelte";
  import Search from "@lucide/svelte/icons/search";
  import Plus from "@lucide/svelte/icons/plus";
  import Clock from "@lucide/svelte/icons/clock";
  import Check from "@lucide/svelte/icons/check";
  import Lock from "@lucide/svelte/icons/lock";
  import Globe from "@lucide/svelte/icons/globe";
  import Link from "@lucide/svelte/icons/link";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import { app, playlistsFor, createPlaylist, removeChosenPlaylist, keyForPlaylist } from "$lib/state.svelte";
  import { WATCH_LATER, type AccountId, type Playlist } from "$lib/data";
  import { cn } from "$lib/utils";

  let {
    account = app.env.account,
    mode = "multi",
    selected = $bindable([]),
    value = $bindable(""),
    membership = [],
    allowAsk = false,
    readonly = false,
    skin = "ext",
    maxHeight = "16rem",
    onpick,
    rowExtra,
  }: {
    account?: AccountId;
    /** multi: checkboxes (auto-add); single: one choice (targets); action: each click acts (save now). */
    mode?: "multi" | "single" | "action";
    selected?: string[];
    value?: string;
    /** Playlists that already hold the video or song. */
    membership?: string[];
    allowAsk?: boolean;
    /** Cached list shown while no YouTube tab is open. */
    readonly?: boolean;
    skin?: "ext" | "yt";
    maxHeight?: string;
    onpick?: (id: string) => void;
    rowExtra?: Snippet<[Playlist]>;
  } = $props();

  let query = $state("");
  let creating = $state(false);
  let newTitle = $state("");
  let newPrivacy = $state<Playlist["privacy"]>("private");

  const list = $derived(
    playlistsFor(account).filter((p) => p.title.toLowerCase().includes(query.trim().toLowerCase())),
  );

  /** Chosen playlists YouTube no longer lists (deleted): shown first, marked Missing, with Remove (ticket 12). */
  const gone = $derived(
    mode === "multi" ? selected.filter((id) => !playlistsFor(account).some((p) => p.id === id)) : [],
  );

  /** Ticket 12: creating needs a signed-in account and an open YouTube tab. */
  const createBlocked = $derived(
    !app.env.signedIn
      ? "Sign in to YouTube to create playlists."
      : !app.env.youtubeOpen && !app.env.musicOpen
        ? "Open YouTube to create playlists."
        : null,
  );

  const isOn = (id: string) => (mode === "multi" ? selected.includes(id) : mode === "single" ? value === id : membership.includes(id));

  function pick(id: string) {
    if (readonly) return;
    if (mode === "multi") selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    else if (mode === "single") value = id;
    onpick?.(id);
  }

  function create() {
    if (!newTitle.trim()) return;
    const id = createPlaylist(account, newTitle.trim(), newPrivacy);
    creating = false;
    newTitle = "";
    pick(id);
  }

  const yt = $derived(skin === "yt");
</script>

<div class={cn("flex min-w-0 flex-col", yt ? "text-yt-text text-sm" : "text-sm")}>
  <label
    class={cn(
      "mb-1.5 flex items-center gap-2 rounded-md px-2 py-1.5",
      yt ? "bg-white/10" : "border-input bg-background border",
    )}
  >
    <Search class="size-3.5 opacity-60" />
    <input
      class="w-full bg-transparent text-sm outline-none placeholder:opacity-60"
      placeholder="Search playlists"
      bind:value={query}
    />
  </label>

  <div class="overflow-y-auto pr-1" style="max-height: {maxHeight}">
    {#if allowAsk && mode === "single"}
      <button
        type="button"
        class={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left", yt ? "hover:bg-white/10" : "hover:bg-accent")}
        onclick={() => pick("ask")}
        disabled={readonly}
      >
        <span class={cn("flex size-4 items-center justify-center rounded-full border", value === "ask" && (yt ? "border-yt-text bg-yt-text" : "border-primary bg-primary"))}></span>
        <span class="flex-1">None yet</span>
        <span class="text-xs opacity-60">the next save asks, and its pick sticks</span>
      </button>
    {/if}

    {#each gone as id (id)}
      <div class={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5", yt ? "bg-red-500/10" : "bg-destructive/10")}>
        <TriangleAlert class="text-destructive size-4 shrink-0" />
        <span class="min-w-0 flex-1">
          <span class="block truncate">{app.goneTitles[id] ?? "A playlist that's no longer available"}</span>
          <span class="text-destructive text-xs font-medium">Missing: it doesn't exist anymore</span>
        </span>
        {#if !readonly}
          <button type="button" class="rounded px-1.5 py-0.5 text-xs underline-offset-2 hover:underline" onclick={() => removeChosenPlaylist(account, id)}
            >Remove</button
          >
        {/if}
      </div>
    {/each}

    {#each list as p (p.id)}
      <div
        class={cn(
          "group flex w-full items-center gap-2 rounded-md px-2 py-1.5",
          yt ? "hover:bg-white/10" : "hover:bg-accent",
          readonly && "opacity-70",
        )}
      >
        <button type="button" class="flex min-w-0 flex-1 items-center gap-2 text-left" onclick={() => pick(p.id)} disabled={readonly}>
          {#if mode === "multi"}
            <span
              class={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                isOn(p.id) && (yt ? "border-yt-text bg-yt-text text-black" : "border-primary bg-primary text-primary-foreground"),
              )}
            >
              {#if isOn(p.id)}<Check class="size-3" />{/if}
            </span>
          {:else if mode === "single"}
            <span
              class={cn(
                "flex size-4 shrink-0 rounded-full border",
                isOn(p.id) && (yt ? "border-yt-text bg-yt-text" : "border-primary bg-primary"),
              )}
            ></span>
          {:else}
            <span class="flex size-4 shrink-0 items-center justify-center">
              {#if isOn(p.id)}<Check class="size-4" />{:else}<Plus class="size-4 opacity-60" />{/if}
            </span>
          {/if}
          <span class="size-6 shrink-0 rounded" style="background: hsl({p.hue} 45% 45%)">
            {#if p.id === WATCH_LATER}<Clock class="m-1 size-4 text-white" />{/if}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate">{p.title}</span>
            <span class="flex items-center gap-1 text-xs opacity-60">
              {#if p.privacy === "private"}<Lock class="size-3" />{:else if p.privacy === "public"}<Globe class="size-3" />{:else}<Link class="size-3" />{/if}
              {p.privacy} · {p.count} videos
              {#if membership.includes(p.id) && mode !== "action"}· <Check class="size-3" /> already in it{/if}
            </span>
            {#if app.marks[p.id] && isOn(p.id)}
              <span class="text-destructive text-xs font-medium">{app.marks[p.id] === "full" ? "Full: it holds 5,000 videos" : "Missing"}</span>
            {/if}
          </span>
        </button>
        {#if keyForPlaylist(account, p.id)}
          <!-- Ticket 08: the picker shows each playlist's shortcut key, which teaches the keys where playlists are chosen. -->
          <kbd
            class={cn("shrink-0 rounded border px-1 font-mono text-[10px] opacity-70", yt ? "border-white/30" : "bg-muted")}
            title="Playlist shortcut">{keyForPlaylist(account, p.id)}</kbd
          >
        {/if}
        {#if app.marks[p.id] && isOn(p.id) && mode !== "action" && !readonly}
          <button type="button" class="rounded px-1.5 py-0.5 text-xs underline-offset-2 hover:underline" onclick={() => removeChosenPlaylist(account, p.id)}
            >Remove</button
          >
        {/if}
        {#if rowExtra}{@render rowExtra(p)}{/if}
      </div>
    {:else}
      <p class="px-2 py-3 text-xs opacity-60">No playlist matches "{query}".</p>
    {/each}
  </div>

  {#if !readonly && createBlocked}
    <p class="mt-1 flex items-center gap-2 px-2 py-1.5 text-xs opacity-70"><Plus class="size-4" /> {createBlocked}</p>
  {:else if !readonly}
    {#if creating}
      <div class={cn("mt-1.5 flex flex-col gap-1.5 rounded-md p-2", yt ? "bg-white/5" : "bg-muted")}>
        <input
          class={cn("rounded px-2 py-1 text-sm outline-none", yt ? "bg-white/10" : "border-input bg-background border")}
          placeholder="New playlist name"
          bind:value={newTitle}
          onkeydown={(e) => e.key === "Enter" && create()}
        />
        <div class="flex items-center gap-2 text-xs">
          <select class={cn("rounded px-1 py-0.5", yt ? "bg-white/10" : "border-input bg-background border")} bind:value={newPrivacy}>
            <option value="private">Private</option>
            <option value="unlisted">Unlisted</option>
            <option value="public">Public</option>
          </select>
          <span class="flex-1"></span>
          <button type="button" class="opacity-70 hover:opacity-100" onclick={() => (creating = false)}>Cancel</button>
          <button
            type="button"
            class={cn("rounded px-2 py-1 font-medium", yt ? "bg-yt-text text-black" : "bg-primary text-primary-foreground")}
            onclick={create}>Create</button
          >
        </div>
      </div>
    {:else}
      <button
        type="button"
        class={cn("mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-left", yt ? "hover:bg-white/10" : "hover:bg-accent")}
        onclick={() => (creating = true)}
      >
        <Plus class="size-4" /> New playlist
      </button>
    {/if}
  {/if}
</div>
