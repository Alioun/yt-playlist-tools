<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). A mock of ytmusic-two-row-item-renderer (album and playlist cards). On hover,
  // YouTube Music draws a top gradient, its ⋮ top-right and its play button bottom-right; ours sit bottom-left in
  // the same style, one size smaller.
  import Icon from "../kit/Icon.svelte";
  import Quick from "./Quick.svelte";
  import { COLLECTIONS } from "./data";
  import { ui } from "./store.svelte";

  let { id, width = 145 }: { id: string; width?: number } = $props();
  const c = $derived(COLLECTIONS[id]);
  const key = $derived(`card:${id}`);
  let hover = $state(false);
  let focus = $state(false);
  const hot = $derived(hover || focus || ui.forceHover === key || ui.forceFocus === key);
</script>

<div
  class="card"
  style="width:{width}px"
  data-item={key}
  onpointerenter={() => (hover = true)}
  onpointerleave={() => (hover = false)}
  onfocusin={(e) => {
    if ((e.target as HTMLElement).matches(":focus-visible")) focus = true;
  }}
  onfocusout={(e) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) focus = false;
  }}
>
  <div class="thumb" style="height:{width}px; background:{c.art}">
    <span class="label">{c.title}</span>
    {#if hot}
      <span class="grad"></span>
      <span class="ytmmenu"><Icon name="more" /></span>
      <span class="ytmplay"><Icon name="play" /></span>
      <span class="ours"><Quick itemKey={key} place="card" /></span>
    {/if}
  </div>
  <div class="details">
    <a class="title" href="#{id}" onclick={(e) => e.preventDefault()}>{c.title}</a>
    <div class="sub">{c.kind === "album" ? "Album" : "Playlist"} • {c.by}</div>
  </div>
</div>

<style>
  .card {
    flex: none;
    font-size: 16px;
    line-height: 19.2px;
  }
  .thumb {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
  }
  .label {
    position: absolute;
    left: 10px;
    top: 10px;
    right: 10px;
    font: 700 15px/1.1 "YouTube Sans", Roboto, sans-serif;
    color: rgba(255, 255, 255, 0.92);
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }
  .grad {
    position: absolute;
    inset: 0;
    background: linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0), rgba(0, 0, 0, 0));
  }
  .ytmmenu {
    position: absolute;
    top: 8px;
    right: 4px;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ytmplay {
    position: absolute;
    right: 12px;
    bottom: 13px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ours {
    position: absolute;
    left: 8px;
    bottom: 17px;
    display: inline-flex;
  }
  .details {
    margin-top: 7px;
  }
  .title {
    font-weight: 500;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    outline: none;
  }
  .title:focus-visible {
    text-decoration: underline;
  }
  .sub {
    color: rgba(255, 255, 255, 0.7);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-top: 4px;
  }
</style>
