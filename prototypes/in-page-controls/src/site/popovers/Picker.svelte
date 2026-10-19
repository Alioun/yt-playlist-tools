<script lang="ts">
  // The playlist picker (tickets 12, 26), lazy in popovers.js with Bits UI. YouTube's popup look: menu surface, 12px
  // radius, 40px rows. Watch later first, a search field focused on open, a check mark where the video already is
  // (loading until membership arrives), the row is its own feedback (busy, checked, "Couldn't save"; no toasts), each
  // row's shortcut key, a pin for the quick-save playlist, and New playlist (title + visibility, Private by default).
  import { Popover } from "bits-ui";
  import Glyph from "./Glyph.svelte";
  import type { Anchor } from "../feature";

  let {
    anchor,
    video,
    mode,
    side = "bottom",
    lib,
    close,
  }: {
    anchor: Anchor;
    video: { id: string; title: string };
    mode: "pick" | "choose";
    side?: "bottom" | "right";
    lib: any;
    close: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  const I = lib.I;
  // svelte-ignore state_referenced_locally
  let snap = $state(lib.snapshot());
  $effect(() => lib.watchView((s: any) => (snap = s)));

  let open = $state(true);
  let query = $state("");
  let input: HTMLInputElement | undefined = $state();
  let member: string[] | null | undefined = $state(undefined);
  let rows: Record<string, "busy" | "failed" | "failedRemove" | undefined> = $state({});
  let creating = $state(false);
  let newTitle = $state("");
  let privacy = $state("private");
  let createBusy = $state(false);
  let createError = $state("");

  // svelte-ignore state_referenced_locally
  lib.flows.membership(video.id).then((m: string[] | null) => (member = m));

  const choose = $derived(mode === "choose");
  const list = $derived(
    (snap.playlists as any[]).filter((p) => p.title.toLowerCase().includes(query.trim().toLowerCase())),
  );
  const titleTaken = $derived(
    !!newTitle.trim() && (snap.playlists as any[]).some((p) => p.title.toLowerCase() === newTitle.trim().toLowerCase()),
  );
  const badChars = $derived(/[<>]/.test(newTitle));
  // svelte-ignore state_referenced_locally
  const measurable = typeof anchor === "function" ? { getBoundingClientRect: anchor } : anchor;
  const privacyIcon = (p: string) => (p === "private" ? I.lock : p === "unlisted" ? I.link : I.globe);
  const privacyLabel = (p: string) => (p === "private" ? "Private" : p === "unlisted" ? "Unlisted" : "Public");

  async function toggle(p: { id: string; title: string }) {
    if (rows[p.id] === "busy") return;
    if (choose) {
      rows[p.id] = "busy";
      lib.view.quickSave = p.id;
      open = false;
      close();
      lib.flows.add(video, [p.id], "picker", { choose: true });
      return;
    }
    const checked = member?.includes(p.id);
    rows[p.id] = "busy";
    if (checked) {
      // PROVISIONAL (tickets 12 and 26): unticking removes the video, as YouTube's own Save dialog does.
      const ok = await lib.flows.remove(video, p.id);
      rows[p.id] = ok ? undefined : "failedRemove";
      if (ok && member) member = member.filter((x) => x !== p.id);
    } else {
      const r = await lib.flows.addFromPicker(video, p.id);
      rows[p.id] = r === "failed" ? "failed" : undefined;
      if (r !== "failed") member = [...(member ?? []), p.id];
    }
  }

  async function createPlaylist(e: SubmitEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || badChars || createBusy) return;
    createBusy = true;
    createError = "";
    const id = await lib.flows.create(video, title, privacy);
    createBusy = false;
    creating = false;
    newTitle = "";
    member = [...(member ?? []), id];
    if (choose) {
      lib.view.quickSave = id;
      open = false;
      close();
    }
  }

  function onkeydown(e: KeyboardEvent) {
    // isolateEvents stops key events at our shadow root, so Bits UI's document-level Escape listener never hears
    // Escape (checked in the dev build). The popover closes itself on Escape instead.
    if (e.key === "Escape" && (globalThis as any).__pp?.escapeFix !== false) {
      e.preventDefault();
      if (creating) creating = false;
      else {
        open = false;
        close();
      }
    }
  }
</script>

<Popover.Root
  bind:open
  onOpenChange={(o) => {
    if (!o) close();
  }}
>
  <Popover.Content
    customAnchor={measurable}
    {side}
    align={side === "right" ? "start" : "start"}
    sideOffset={8}
    collisionPadding={16}
    onOpenAutoFocus={(e) => {
      e.preventDefault();
      input?.focus();
    }}
    {onkeydown}
  >
    <div class="panel" role="dialog" aria-label={choose ? "Save videos to" : "Save to playlist"}>
      <div class="head">
        <div>
          <div class="title">{choose ? "Save videos to…" : "Save to…"}</div>
          {#if choose}<div class="sub">One click will save here from now on.</div>{/if}
        </div>
        <button type="button" class="icon-btn" aria-label="Close" onclick={() => ((open = false), close())}><Glyph d={I.close} /></button>
      </div>
      <label class="search">
        <Glyph d={I.search} size={20} />
        <input bind:this={input} bind:value={query} placeholder="Search playlists" aria-label="Search playlists" />
      </label>
      {#if member === null}<p class="note">Couldn't check where this video already is.</p>{/if}
      <div class="list" role="list">
        {#each list as p (p.id)}
          {@const checked = !!member?.includes(p.id)}
          {@const st = rows[p.id]}
          <div class="row" role="listitem">
            <button
              type="button"
              class="pick"
              role="checkbox"
              aria-checked={checked}
              aria-busy={st === "busy"}
              onclick={() => toggle(p)}
            >
              <span class="box" class:on={checked} class:loading={member === undefined && !st} class:busy={st === "busy"}>
                {#if st === "busy"}<span class="spin"></span>{:else if checked}<Glyph d={I.check} size={18} />{/if}
              </span>
              <span class="name">
                <span class="t">{p.title}</span>
                {#if st === "failed" || st === "failedRemove"}
                  <span class="err"><Glyph d={I.error} size={16} />{st === "failed" ? "Couldn't save" : "Couldn't remove"}</span>
                {/if}
              </span>
              <span class="priv" title={privacyLabel(p.privacy)}><Glyph d={privacyIcon(p.privacy)} size={18} /></span>
              {#if p.key && snap.features.shortcuts}<kbd>{p.key}</kbd>{/if}
            </button>
            <button
              type="button"
              class="pin"
              class:on={snap.quickSave === p.id}
              aria-pressed={snap.quickSave === p.id}
              title={snap.quickSave === p.id ? "One-click save goes here" : "Use for one-click save"}
              aria-label={`Use ${p.title} for one-click save`}
              onclick={() => (lib.view.quickSave = p.id)}><Glyph d={snap.quickSave === p.id ? I.pin : I.pinOutline} size={18} /></button
            >
          </div>
        {:else}
          <p class="note">No playlist matches "{query}".</p>
        {/each}
      </div>
      <div class="foot">
        {#if creating}
          <form class="create" onsubmit={createPlaylist}>
            <label class="field">
              <span>Name</span>
              <!-- svelte-ignore a11y_autofocus -->
              <input bind:value={newTitle} maxlength="150" placeholder="Choose a title" autofocus />
            </label>
            {#if badChars}<p class="hint err">Titles can't contain &lt; or &gt;</p>
            {:else if titleTaken}<p class="hint">You already have a playlist called {newTitle.trim()}.</p>{/if}
            {#if createError}<p class="hint err">{createError}</p>{/if}
            <label class="field">
              <span>Visibility</span>
              <select bind:value={privacy}>
                <option value="private">Private</option>
                <option value="unlisted">Unlisted</option>
                <option value="public">Public</option>
              </select>
            </label>
            <div class="actions">
              <button type="button" class="text" onclick={() => (creating = false)}>Cancel</button>
              <button type="submit" class="filled" disabled={!newTitle.trim() || badChars || createBusy}
                >{createBusy ? "Creating…" : "Create"}</button
              >
            </div>
          </form>
        {:else}
          <button type="button" class="new" onclick={() => (creating = true)}><Glyph d={I.plus} />New playlist</button>
        {/if}
      </div>
    </div>
  </Popover.Content>
</Popover.Root>

<style>
  .panel {
    width: 320px;
    max-height: min(520px, calc(100vh - 32px));
    display: flex;
    flex-direction: column;
    background: var(--pt-menu);
    color: var(--pt-text);
    border-radius: 12px;
    box-shadow: 0 4px 32px 0 rgba(0, 0, 0, 0.1);
    font: 400 1.4rem/2rem var(--pt-font);
    overflow: hidden;
    pointer-events: auto;
  }
  :global(:host([dark])) .panel {
    box-shadow: 0 4px 32px 0 rgba(0, 0, 0, 0.5);
  }
  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 12px 8px 4px 16px;
  }
  .title {
    font: 400 1.6rem/2.2rem var(--pt-font);
    padding-top: 6px;
  }
  .sub {
    color: var(--pt-text2);
    font-size: 1.2rem;
    line-height: 1.8rem;
  }
  .icon-btn {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--pt-text);
    cursor: pointer;
  }
  .icon-btn:hover {
    background: var(--pt-tonal);
  }
  .search {
    margin: 4px 16px 8px;
    height: 36px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border: 1px solid var(--pt-outline);
    border-radius: 18px;
    color: var(--pt-text2);
  }
  .search:focus-within {
    border-color: var(--pt-cta);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--pt-text);
    font: inherit;
  }
  .note {
    margin: 4px 16px 8px;
    color: var(--pt-text2);
    font-size: 1.2rem;
    line-height: 1.8rem;
  }
  .list {
    overflow-y: auto;
    padding: 0 0 4px;
  }
  .row {
    display: flex;
    align-items: center;
    padding-right: 8px;
  }
  .row:hover {
    background: var(--pt-tonal);
  }
  .pick {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 16px;
    height: 40px;
    padding: 0 8px 0 16px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .pick:focus-visible,
  .pin:focus-visible,
  .new:focus-visible {
    outline: 2px solid var(--pt-text);
    outline-offset: -2px;
  }
  .box {
    width: 20px;
    height: 20px;
    flex: none;
    display: grid;
    place-items: center;
    border: 2px solid var(--pt-text);
    border-radius: 2px;
  }
  .box.on {
    background: var(--pt-text);
    color: var(--pt-menu);
  }
  .box.loading {
    border-color: var(--pt-disabled);
    animation: pt-pulse 1s ease-in-out infinite alternate;
  }
  .box.busy {
    border-color: transparent;
  }
  .spin {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid var(--pt-text);
    border-right-color: transparent;
    animation: pt-spin 0.8s linear infinite;
  }
  .name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .t {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .err {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--pt-error);
    font-size: 1.2rem;
    line-height: 1.6rem;
  }
  .priv {
    color: var(--pt-text2);
  }
  kbd {
    flex: none;
    font: 500 1.1rem/1.6rem var(--pt-font);
    color: var(--pt-text2);
    border: 1px solid var(--pt-outline);
    border-radius: 4px;
    padding: 0 4px;
  }
  .pin {
    width: 32px;
    height: 32px;
    flex: none;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--pt-text2);
    opacity: 0;
    cursor: pointer;
  }
  .pin.on,
  .row:hover .pin,
  .pin:focus-visible {
    opacity: 1;
  }
  .pin.on {
    color: var(--pt-text);
  }
  .pin:hover {
    background: var(--pt-tonal);
  }
  .foot {
    border-top: 1px solid var(--pt-outline);
    padding: 4px 0;
  }
  .new {
    width: 100%;
    height: 40px;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 16px;
    border: 0;
    background: transparent;
    color: var(--pt-text);
    font: 500 1.4rem/2rem var(--pt-font);
    cursor: pointer;
  }
  .new:hover {
    background: var(--pt-tonal);
  }
  .create {
    padding: 8px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: var(--pt-text2);
    font-size: 1.2rem;
    line-height: 1.6rem;
  }
  .field input,
  .field select {
    height: 32px;
    border: 0;
    border-bottom: 1px solid var(--pt-text2);
    background: transparent;
    color: var(--pt-text);
    font: 400 1.4rem/2rem var(--pt-font);
    outline: 0;
  }
  .field input:focus,
  .field select:focus {
    border-bottom: 2px solid var(--pt-cta);
  }
  .field select option {
    background: var(--pt-menu);
    color: var(--pt-text);
  }
  .hint {
    margin: -4px 0 0;
    color: var(--pt-text2);
    font-size: 1.2rem;
    line-height: 1.6rem;
  }
  .hint.err {
    color: var(--pt-error);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
  .actions button {
    height: 36px;
    padding: 0 16px;
    border: 0;
    border-radius: 18px;
    font: 500 1.4rem/3.6rem var(--pt-font);
    cursor: pointer;
  }
  .text {
    background: transparent;
    color: var(--pt-text);
  }
  .text:hover {
    background: var(--pt-tonal);
  }
  .filled {
    background: var(--pt-text);
    color: var(--pt-menu);
  }
  .filled:disabled {
    background: var(--pt-tonal);
    color: var(--pt-disabled);
    cursor: default;
  }
  @keyframes pt-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes pt-pulse {
    from {
      opacity: 0.35;
    }
  }
</style>
