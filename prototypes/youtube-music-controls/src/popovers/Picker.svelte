<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). The playlist picker in YouTube Music's own look (its ⋮ menu's surface:
  // #212121, a 1 px light border, 48 px rows). Bits UI Popover does positioning, focus and dismissal. Anchored to
  // the Save button's ▾; opened by key with no button, it sits centred above the player (ticket 26).
  import { Popover } from "bits-ui";
  import { tick } from "svelte";
  import Icon from "../kit/Icon.svelte";
  import Spinner from "../kit/Spinner.svelte";
  import type { PickerModel, Privacy } from "./picker-model.svelte";

  type Measurable = { getBoundingClientRect(): DOMRect };
  let {
    open = $bindable(false),
    model,
    anchor,
    centred = false,
    portalTo,
    returnFocus,
    strategy = "absolute",
  }: {
    open?: boolean;
    model: PickerModel;
    anchor: HTMLElement | Measurable | null;
    centred?: boolean;
    portalTo?: Element | string;
    returnFocus?: HTMLElement | null;
    strategy?: "absolute" | "fixed";
  } = $props();

  let searchEl: HTMLInputElement | undefined = $state();
  let listEl: HTMLElement | undefined = $state();
  let titleEl: HTMLInputElement | undefined = $state();

  const PRIVACY: { id: Privacy; label: string; icon: "private" | "unlisted" | "public" }[] = [
    { id: "private", label: "Private", icon: "private" },
    { id: "unlisted", label: "Unlisted", icon: "unlisted" },
    { id: "public", label: "Public", icon: "public" },
  ];
  const privacyLabel = (p: Privacy) => PRIVACY.find((x) => x.id === p)!.label;

  function rowKeys(e: KeyboardEvent) {
    const rows = [...(listEl?.querySelectorAll<HTMLElement>("[data-row]") ?? [])];
    const root = (e.currentTarget as HTMLElement).getRootNode() as Document | ShadowRoot;
    const active = (root.activeElement ?? document.activeElement) as HTMLElement;
    const idx = rows.indexOf(active);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      rows[Math.min(rows.length - 1, idx + 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (idx <= 0) searchEl?.focus();
      else rows[idx - 1]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      rows[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      rows.at(-1)?.focus();
    }
  }

  function searchKeys(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      listEl?.querySelector<HTMLElement>("[data-row]")?.focus();
    } else if (e.key === "Enter") {
      const first = model.filtered[0];
      if (first) {
        e.preventDefault();
        model.toggle(first.id);
      }
    }
  }

  async function startCreate() {
    model.creating = true;
    model.newTitle = model.query.trim();
    await tick();
    titleEl?.focus();
  }
</script>

<Popover.Root bind:open>
  <Popover.Portal to={portalTo}>
    <Popover.Content
      customAnchor={anchor}
      {strategy}
      side={centred ? "top" : "bottom"}
      align={centred ? "center" : "end"}
      sideOffset={centred ? 16 : 6}
      collisionPadding={12}
      trapFocus={false}
      style="z-index: 2150; outline: none;"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        searchEl?.focus();
      }}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        returnFocus?.focus();
      }}
    >
      <!-- Escape is handled here, not by Bits UI: the kit's host stops key events (ticket 08's isolation), so Bits'
           document listener never hears it, and letting Escape out would also fire YouTube Music's own Esc
           (collapse the player page). Found in the dev build on real YouTube Music. -->
      <div
        class="picker"
        class:centred
        role="dialog"
        tabindex="-1"
        aria-label={model.mode === "choose" ? "Save songs to…" : "Save to playlist"}
        onkeydown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            open = false;
          }
        }}
      >
        <div class="head">
          <div class="h">
            <div class="title">{model.mode === "choose" ? "Save songs to…" : "Save to playlist"}</div>
            {#if model.mode === "choose"}<div class="sub">The playlist you pick here becomes your one-click Save.</div>{/if}
          </div>
          <Popover.Close class="pp-close" aria-label="Close"><Icon name="close" size={24} /></Popover.Close>
        </div>
        <div class="song">
          <span class="art" style="background:{model.song.art}"></span>
          <span class="st">
            <span class="t1">{model.song.title}</span>
            <span class="t2">{model.song.byline}</span>
          </span>
        </div>
        <label class="search">
          <Icon name="search" size={20} />
          <input bind:this={searchEl} bind:value={model.query} placeholder="Search playlists" aria-label="Search playlists" onkeydown={searchKeys} />
        </label>
        {#if model.membership === "unknown"}
          <div class="note"><Icon name="info" size={18} /><span>Couldn't check where this song already is</span></div>
        {/if}
        <div class="list" bind:this={listEl} role="listbox" aria-multiselectable="true" aria-label="Playlists" tabindex="-1" onkeydown={rowKeys}>
          {#each model.filtered as row (row.id)}
            {@const st = model.rowState[row.id] ?? { kind: "idle" }}
            {@const checked = !!model.contains[row.id]}
            {@const pinned = model.quickSaveId === row.id}
            <div
              class="row"
              class:pinned
              data-row
              role="option"
              aria-selected={checked}
              tabindex="0"
              onclick={() => model.toggle(row.id)}
              onkeydown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  model.toggle(row.id);
                }
              }}
            >
              <span class="cb" aria-hidden="true">
                {#if st.kind === "busy"}<Spinner size={20} />{:else if model.membership === "loading" && !(row.id in model.contains)}<span class="skeleton"></span>{:else}<Icon name={checked ? "checkBox" : "checkBoxBlank"} size={24} />{/if}
              </span>
              <span class="rt">
                <span class="t1">{row.title}</span>
                {#if st.kind === "error"}
                  <span class="t2 err"><Icon name="error" size={14} />{st.text}</span>
                {:else}
                  <span class="t2"><Icon name={row.privacy === "private" ? "private" : row.privacy === "unlisted" ? "unlisted" : "public"} size={14} />{privacyLabel(row.privacy)} · {row.count} songs</span>
                {/if}
              </span>
              {#if row.key}<span class="key" title="Playlist shortcut">{row.key}</span>{/if}
              <button
                class="pin"
                type="button"
                aria-label={pinned ? `${row.title} is your one-click Save` : `Use ${row.title} for one-click Save`}
                title={model.privateWindow ? "Private windows don't save settings" : pinned ? "Used for one-click Save" : "Use for one-click Save"}
                aria-pressed={pinned}
                disabled={model.privateWindow}
                tabindex="-1"
                onclick={(e) => {
                  e.stopPropagation();
                  model.pin(row.id);
                }}><Icon name={pinned ? "pinned" : "pin"} size={20} /></button
              >
            </div>
          {:else}
            <div class="empty">No playlists match "{model.query}"</div>
          {/each}
        </div>
        <div class="foot">
          {#if model.creating}
            <form
              class="create"
              onsubmit={(e) => {
                e.preventDefault();
                model.create();
              }}
            >
              <input bind:this={titleEl} class="field" bind:value={model.newTitle} placeholder="Title" maxlength="150" aria-label="Playlist title" />
              <div class="privacy" role="radiogroup" aria-label="Visibility">
                {#each PRIVACY as p}
                  <button type="button" role="radio" aria-checked={model.newPrivacy === p.id} class:on={model.newPrivacy === p.id} onclick={() => (model.newPrivacy = p.id)}>
                    <Icon name={p.icon} size={16} />{p.label}
                  </button>
                {/each}
              </div>
              {#if model.createError}<div class="cerr"><Icon name="error" size={14} />{model.createError}</div>{/if}
              <div class="cbtns">
                <button type="button" class="text" onclick={() => (model.creating = false)}>Cancel</button>
                <button type="submit" class="filled" disabled={model.createBusy}>{#if model.createBusy}<Spinner size={16} />{:else}Create{/if}</button>
              </div>
            </form>
          {:else}
            <button class="newpl" type="button" onclick={startCreate}><Icon name="add" size={24} /><span>New playlist</span></button>
          {/if}
        </div>
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  .picker {
    box-sizing: border-box;
    width: 360px;
    /* Bits UI's floating layer reports the room left on the chosen side; the list scrolls inside it. */
    max-height: min(560px, calc(var(--bits-floating-available-height, 560px) - 8px));
    display: flex;
    flex-direction: column;
    background: #212121;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
    color: #fff;
    font: 400 1.4rem/2rem Roboto, "Noto Naskh Arabic UI", Arial, sans-serif;
    padding: 8px 0;
    animation: pop 0.12s cubic-bezier(0.2, 0, 0, 1);
    overflow: hidden;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  .centred {
    animation-name: popc;
  }
  @keyframes popc {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 4px 8px 4px 16px;
  }
  .h {
    flex: 1;
    padding-top: 6px;
  }
  .title {
    font: 500 1.6rem/2.4rem Roboto, sans-serif;
  }
  .sub {
    font-size: 1.2rem;
    line-height: 1.6rem;
    color: rgba(255, 255, 255, 0.7);
    margin-top: 2px;
  }
  .head :global(.pp-close) {
    all: unset;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #fff;
  }
  .head :global(.pp-close:hover) {
    background: rgba(255, 255, 255, 0.1);
  }
  .head :global(.pp-close:focus-visible) {
    outline: 2px solid #fff;
    outline-offset: -2px;
  }
  .song {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 16px 10px;
  }
  .art {
    width: 32px;
    height: 32px;
    border-radius: 2px;
    flex: none;
  }
  .st {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .t1 {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .t2 {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 1.2rem;
    line-height: 1.6rem;
    color: rgba(255, 255, 255, 0.7);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .song .t1 {
    font-weight: 500;
  }
  .search {
    margin: 0 16px 8px;
    height: 40px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.7);
  }
  .search:focus-within {
    border-color: rgba(255, 255, 255, 0.5);
    background: rgba(255, 255, 255, 0.12);
  }
  .search input {
    all: unset;
    flex: 1;
    color: #fff;
    font: 400 1.4rem/2rem Roboto, sans-serif;
  }
  .search input::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }
  .note {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 16px 6px;
    font-size: 1.2rem;
    line-height: 1.6rem;
    color: rgba(255, 255, 255, 0.7);
  }
  .list {
    overflow-y: auto;
    flex: 1;
    min-height: 96px;
    outline: none;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 48px;
    padding: 0 8px 0 16px;
    cursor: pointer;
    outline: none;
  }
  .row:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .row:focus-visible {
    background: rgba(255, 255, 255, 0.1);
    box-shadow: inset 2px 0 0 #fff;
  }
  .cb {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }
  .skeleton {
    width: 18px;
    height: 18px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.12);
    animation: pulse 1s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    to {
      opacity: 0.4;
    }
  }
  .rt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .t2.err {
    color: #ff8a80;
  }
  .key {
    flex: none;
    font: 500 1.1rem/1.6rem Roboto, sans-serif;
    color: rgba(255, 255, 255, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    padding: 1px 5px;
  }
  .pin {
    all: unset;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    opacity: 0;
  }
  .row:hover .pin,
  .row:focus-visible .pin,
  .row:focus-within .pin,
  .pinned .pin {
    opacity: 1;
  }
  .pinned .pin {
    color: #fff;
  }
  .pin:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .pin:disabled {
    cursor: default;
    opacity: 0.38 !important;
  }
  .empty {
    padding: 14px 16px;
    color: rgba(255, 255, 255, 0.7);
  }
  .foot {
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    margin-top: 4px;
    padding-top: 4px;
  }
  .newpl {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    height: 48px;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 16px;
    cursor: pointer;
  }
  .newpl:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .newpl:focus-visible {
    background: rgba(255, 255, 255, 0.1);
  }
  .create {
    padding: 8px 16px 4px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .field {
    all: unset;
    height: 36px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.5);
    color: #fff;
    font: 400 1.4rem/2rem Roboto, sans-serif;
  }
  .field:focus {
    border-bottom: 2px solid #fff;
  }
  .privacy {
    display: flex;
    gap: 8px;
  }
  .privacy button {
    all: unset;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    font-size: 1.3rem;
    cursor: pointer;
  }
  .privacy button.on {
    background: #fff;
    color: #030303;
  }
  .privacy button:focus-visible,
  .cbtns button:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }
  .cerr {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 1.2rem;
    color: #ff8a80;
  }
  .cbtns {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .cbtns button {
    all: unset;
    height: 36px;
    padding: 0 16px;
    border-radius: 18px;
    font: 500 1.4rem/3.6rem Roboto, sans-serif;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
  }
  .cbtns .text:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .cbtns .filled {
    background: #fff;
    color: #030303;
  }
</style>
