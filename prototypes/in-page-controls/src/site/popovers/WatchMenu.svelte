<script lang="ts">
  // The watch-page button's menu (ticket 09): the popup's "This video" card in YouTube's menu look. The status line,
  // each auto-add playlist's outcome, Don't auto-add this video, Pause auto-add, this channel's filter per playlist,
  // Save to the quick-save playlist and Save to…, and a link to settings. Lazy, in popovers.js.
  import { Popover } from "bits-ui";
  import Glyph from "./Glyph.svelte";
  import { statusOf } from "../../shared/auto-add-status";

  let {
    anchor,
    video,
    side = "bottom",
    lib,
    close,
    openPicker,
  }: {
    anchor: Element;
    video: { id: string; title: string; channel?: string };
    side?: "bottom" | "left";
    lib: any;
    close: () => void;
    openPicker: (mode: "pick" | "choose") => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  const I = lib.I;
  // svelte-ignore state_referenced_locally
  let snap = $state(lib.snapshot());
  $effect(() => lib.watchView((s: any) => (snap = s)));
  let open = $state(true);
  let saving = $state<"idle" | "busy" | "failed">("idle");

  const st = $derived(statusOf(snap));
  const auto = $derived(snap.features.autoAdd && st.kind !== "notTracked" && st.kind !== "off");
  const qs = $derived(snap.quickSave as string | null);
  const qsTitle = $derived(qs ? (snap.playlists.find((p: any) => p.id === qs)?.title ?? "") : "");
  const saved = $derived(!!qs && (snap.membership[video.id] ?? []).includes(qs));
  const channel = $derived(video.channel || snap.watchVideo.channel || "this channel");
  const leadD = $derived(
    ({ check: I.check, error: I.error, block: I.block, pause: I.pause, live: I.live, warning: I.warning, mark: I.mark } as Record<string, string>)[
      st.lead
    ],
  );

  function setKind(kind: string) {
    if (kind === "skipped" || kind === "paused") lib.view.autoAdd.before = lib.view.autoAdd.kind;
    lib.view.autoAdd.kind = kind;
  }

  function filterOf(id: string) {
    return snap.filters[id] as null | { mode: "allow" | "deny"; channels: string[] };
  }
  function toggleChannel(id: string) {
    const f = filterOf(id);
    if (!f) return void (lib.view.filters[id] = { mode: "deny", channels: [channel] });
    const listed = f.channels.includes(channel);
    lib.view.filters[id] = { mode: f.mode, channels: listed ? f.channels.filter((c) => c !== channel) : [...f.channels, channel] };
  }

  async function quickSave() {
    if (!qs) {
      open = false;
      close();
      return openPicker("choose");
    }
    if (saved || saving === "busy") return;
    saving = "busy";
    const r = await lib.flows.addFromPicker(video, qs);
    saving = r === "failed" ? "failed" : "idle";
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && (globalThis as any).__pp?.escapeFix !== false) {
      e.preventDefault();
      open = false;
      close();
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
    customAnchor={anchor}
    {side}
    align={side === "left" ? "end" : "end"}
    sideOffset={8}
    collisionPadding={16}
    {onkeydown}
    onOpenAutoFocus={(e) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement)?.querySelector<HTMLElement>("button")?.focus();
    }}
  >
    <div class="menu" role="dialog" aria-label="This video">
      {#if auto}
        <div class="status">
          <span class="lead" class:err={st.lead === "error"}>
            {#if st.lead === "ring"}
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"
                ><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.6" /><circle
                  cx="12"
                  cy="12"
                  r="4.25"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="8.5"
                  stroke-dasharray="{Math.max(0.04, Math.min(1, st.ring)) * 26.7} 26.7"
                  transform="rotate(-90 12 12)"
                /></svg
              >
            {:else}<Glyph d={leadD} />{/if}
          </span>
          <span>{st.line}</span>
        </div>
        {#if st.rows.length}
          <ul class="outcomes">
            {#each st.rows as r (r.id)}
              <li class:muted={r.muted}>
                <span class="pl">{r.title}</span>
                <span class="oc">{#if r.done}<Glyph d={I.check} size={16} />{/if}{r.text}</span>
              </li>
            {/each}
          </ul>
        {/if}
        <div class="sep"></div>
        {#if st.kind === "skipped"}
          <button type="button" class="item" onclick={() => setKind(snap.autoAdd.before === "skipped" ? "counting" : snap.autoAdd.before)}
            ><Glyph d={I.play} />Auto-add this video again</button
          >
        {:else if st.kind !== "paused" && st.kind !== "live" && st.kind !== "cantMeasure"}
          <button type="button" class="item" onclick={() => setKind("skipped")}><Glyph d={I.block} />Don't auto-add this video</button>
        {/if}
        {#if st.kind === "paused"}
          <button type="button" class="item" onclick={() => setKind(snap.autoAdd.before === "paused" ? "counting" : snap.autoAdd.before)}
            ><Glyph d={I.play} />Resume auto-add</button
          >
        {:else}
          <button type="button" class="item" onclick={() => setKind("paused")}><Glyph d={I.pause} />Pause auto-add</button>
        {/if}
        <div class="sep"></div>
        <div class="heading">Channel filters · {channel}</div>
        {#each ["PLmusic", "PLtalks", "PLkids"] as id (id)}
          {@const f = filterOf(id)}
          {@const listed = !!f?.channels.includes(channel)}
          <div class="filter">
            <span class="pl">
              <span>{snap.playlists.find((p: any) => p.id === id)?.title}</span>
              <span class="small"
                >{f ? `${f.mode === "allow" ? "Allowlist" : "Denylist"} · ${f.channels.length} channel${f.channels.length === 1 ? "" : "s"}` : "No channel filter"}</span
              >
            </span>
            <button type="button" class="chip" class:on={listed} aria-pressed={listed} onclick={() => toggleChannel(id)}>
              {#if listed}<Glyph d={I.check} size={18} />{f?.mode === "allow" ? "Allowed" : "Denied"}{:else}{f?.mode === "allow" ? "Allow" : "Deny"}{/if}
            </button>
          </div>
        {/each}
        <div class="sep"></div>
      {/if}
      <button type="button" class="item" onclick={quickSave} aria-busy={saving === "busy"}>
        {#if saving === "busy"}<span class="spin"></span>{:else}<Glyph d={saved ? I.bookmarkFilled : I.bookmark} />{/if}
        <span class="grow">{qs ? (saved ? `Saved to ${qsTitle}` : `Save to ${qsTitle}`) : "Save to playlist…"}</span>
        {#if saving === "failed"}<span class="small err">Couldn't save</span>{/if}
      </button>
      {#if qs}
        <button
          type="button"
          class="item"
          onclick={() => {
            open = false;
            close();
            openPicker("pick");
          }}><Glyph d={I.playlistAdd} /><span class="grow">Save to…</span>{#if snap.features.shortcuts}<kbd>Alt+Shift+P</kbd>{/if}</button
        >
      {/if}
      <div class="sep"></div>
      <button type="button" class="item quiet" onclick={() => lib.flows.hooks.openSettings("watch-page button")}
        ><Glyph d={I.mark} />{lib.PRODUCT} settings</button
      >
    </div>
  </Popover.Content>
</Popover.Root>

<style>
  .menu {
    width: 340px;
    max-height: min(560px, calc(100vh - 32px));
    overflow-y: auto;
    padding: 8px 0;
    background: var(--pt-menu);
    color: var(--pt-text);
    border-radius: 12px;
    box-shadow: 0 4px 32px 0 rgba(0, 0, 0, 0.1);
    font: 400 1.4rem/2rem var(--pt-font);
    pointer-events: auto;
  }
  :global(:host([dark])) .menu {
    box-shadow: 0 4px 32px 0 rgba(0, 0, 0, 0.5);
  }
  .status {
    display: flex;
    gap: 16px;
    align-items: center;
    padding: 8px 16px;
    font-weight: 500;
  }
  .lead {
    display: flex;
  }
  .lead.err {
    color: var(--pt-error);
  }
  .outcomes {
    list-style: none;
    margin: 0;
    padding: 0 16px 4px 56px;
  }
  .outcomes li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 2px 0;
    color: var(--pt-text);
  }
  .outcomes li.muted {
    color: var(--pt-text2);
  }
  .pl {
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .pl > span:first-child {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .oc {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--pt-text2);
    max-width: 55%;
    text-align: right;
  }
  .sep {
    height: 1px;
    margin: 8px 0;
    background: var(--pt-outline);
  }
  .heading {
    padding: 4px 16px;
    color: var(--pt-text2);
    font-size: 1.2rem;
    line-height: 1.8rem;
  }
  .item {
    width: 100%;
    min-height: 36px;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 16px;
    border: 0;
    background: transparent;
    color: var(--pt-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .item:hover {
    background: var(--pt-tonal);
  }
  .item:focus-visible,
  .chip:focus-visible {
    outline: 2px solid var(--pt-text);
    outline-offset: -2px;
  }
  .item.quiet {
    color: var(--pt-text2);
  }
  .grow {
    flex: 1;
  }
  .filter {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 16px;
  }
  .small {
    color: var(--pt-text2);
    font-size: 1.2rem;
    line-height: 1.6rem;
  }
  .err {
    color: var(--pt-error);
  }
  .chip {
    flex: none;
    height: 32px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: var(--pt-tonal);
    color: var(--pt-text);
    font: 500 1.4rem/2rem var(--pt-font);
    cursor: pointer;
  }
  .chip:hover {
    background: var(--pt-tonal-hover);
  }
  .chip.on {
    background: var(--pt-text);
    color: var(--pt-menu);
  }
  kbd {
    font: 500 1.1rem/1.6rem var(--pt-font);
    color: var(--pt-text2);
    border: 1px solid var(--pt-outline);
    border-radius: 4px;
    padding: 0 4px;
  }
  .spin {
    width: 20px;
    height: 20px;
    margin: 2px;
    border-radius: 50%;
    border: 2px solid var(--pt-text);
    border-right-color: transparent;
    animation: pt-spin 0.8s linear infinite;
  }
  @keyframes pt-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
