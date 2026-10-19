<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). A mock of ytmusic-responsive-list-item-renderer in its three heights, with
  // our buttons placed per the current variant.
  import Icon from "../kit/Icon.svelte";
  import YtmButtons from "./YtmButtons.svelte";
  import Quick from "./Quick.svelte";
  import { SONGS } from "./data";
  import { ui, liked, settings, narrowRows } from "./store.svelte";

  let {
    songId,
    ctx,
    layout = "compact",
    index,
  }: { songId: string; ctx: string; layout?: "compact" | "wide" | "album" | "search"; index?: number } = $props();

  const s = $derived(SONGS[songId]);
  const key = $derived(`row:${songId}@${ctx}`);
  let hover = $state(false);
  let focus = $state(false);
  const hot = $derived(hover || focus || ui.forceHover === key || ui.forceFocus === key);
  const wide = $derived(layout !== "compact");
  const v = $derived(ui.variant);

  // Measure the title while our buttons show: below 48 px the tooltips name the song (ticket 27).
  let titleEl: HTMLElement | undefined = $state();
  $effect(() => {
    if (!hot || !titleEl) return;
    requestAnimationFrame(() => {
      const w = titleEl!.getBoundingClientRect().width;
      if (w < 48) narrowRows.add(key);
      else narrowRows.delete(key);
    });
  });
</script>

<div
  class="row {layout}"
  class:hot
  class:forcefocus={ui.forceFocus === key}
  data-item={key}
  role="listitem"
  onpointerenter={() => (hover = true)}
  onpointerleave={() => (hover = false)}
  onfocusin={(e) => {
    if ((e.target as HTMLElement).matches(":focus-visible")) focus = true;
  }}
  onfocusout={(e) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) focus = false;
  }}
>
  <div class="left">
    {#if layout === "album"}
      <span class="index">{#if hot}<Icon name="play" />{:else}{index}{/if}</span>
    {:else}
      <span class="thumb" style="background:{s.art}"></span>
      {#if hot}<span class="playov"><Icon name="play" /></span>{/if}
    {/if}
  </div>
  <div class="cols">
    <a class="title" bind:this={titleEl} href="#{s.id}" onclick={(e) => e.preventDefault()}>{s.title}</a>
    <div class="sub">
      {#if layout === "album"}{s.artist} • {s.plays}{:else if layout === "search"}Song • {s.artist} • {s.album} • {s.plays}{:else}{s.artist} • {s.plays} • {s.album}{/if}
    </div>
  </div>
  {#if v === "A" && hot}
    <span class="slot inflow"><Quick itemKey={key} place="row" /></span>
  {:else if v === "B"}
    <span class="slot reserved" style="width:{(settings.buttons.playNext ? 38 : 0) + (settings.buttons.addToQueue ? 38 : 0) + (settings.buttons.save && settings.signedIn ? 60 : 0) + 8}px">{#if hot}<Quick itemKey={key} place="row" />{/if}</span>
  {:else if v === "C" && hot}
    <span class="slot pill"><Quick itemKey={key} place="row" /></span>
  {/if}
  <div class="menu" class:shown={hot}><YtmButtons liked={!!liked[songId]} /></div>
  {#if wide}
    <div class="fixed">{#if hot && layout === "album"}<span class="cbx"><Icon name="checkBoxBlank" /></span>{:else if !hot}{s.duration}{/if}</div>
  {/if}
</div>

<style>
  .row {
    position: relative;
    display: flex;
    align-items: center;
    height: 48px;
    padding: 0 8px;
    color: #fff;
    font-size: 16px;
    line-height: 19.2px;
  }
  .row.wide,
  .row.album {
    height: 68px;
    padding: 0 16px;
    border-radius: 8px;
  }
  .row.search {
    height: 72px;
    padding: 0 8px;
  }
  .row.hot.album,
  .row.hot.wide {
    background: rgba(255, 255, 255, 0.05);
  }
  .left {
    position: relative;
    flex: none;
    width: 48px;
    height: 48px;
    margin-right: 16px;
  }
  .search .left {
    width: 56px;
    height: 56px;
  }
  .thumb {
    position: absolute;
    inset: 0;
    border-radius: 2px;
  }
  .playov {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.8);
    border-radius: 2px;
  }
  .index {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    color: #aaa;
    font-weight: 500;
  }
  .cols {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .title {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    outline: none;
  }
  .title:focus-visible {
    text-decoration: underline;
  }
  .sub {
    color: rgba(255, 255, 255, 0.7);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .wide .sub,
  .album .sub {
    font-size: 14px;
  }
  .slot {
    flex: none;
    display: inline-flex;
    align-items: center;
  }
  .inflow {
    margin-left: 8px;
    margin-right: 8px;
  }
  .reserved {
    justify-content: flex-end;
    padding-right: 8px;
  }
  .pill {
    position: absolute;
    right: calc(var(--menu-w, 126px) + 24px);
    top: 50%;
    transform: translateY(-50%);
    background: #212121;
    border-radius: 20px;
    padding: 2px;
    box-shadow: -16px 0 16px -4px rgba(3, 3, 3, 0.9), 0 2px 8px rgba(0, 0, 0, 0.5);
  }
  .wide .pill,
  .album .pill {
    right: calc(126px + 16px + 58px + 24px);
  }
  .menu {
    flex: none;
    display: none;
  }
  .menu.shown {
    display: inline-flex;
  }
  .wide .menu,
  .album .menu {
    display: inline-flex;
    visibility: hidden;
  }
  .wide .menu.shown,
  .album .menu.shown {
    visibility: visible;
  }
  .fixed {
    flex: none;
    width: 58px;
    margin-left: 16px;
    text-align: right;
    color: rgba(255, 255, 255, 0.7);
    display: flex;
    justify-content: flex-end;
  }
  .cbx {
    color: #aaa;
    display: inline-flex;
  }
  .forcefocus .title {
    text-decoration: underline;
  }
</style>
