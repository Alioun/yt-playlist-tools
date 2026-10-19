<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). An album or playlist page in YouTube Music's two-column layout
  // (ytmusic-responsive-header-renderer on the left, the track list on the right). Our Play next and Add to queue
  // join the header's own buttons, left of its ⋮, always visible.
  import Icon from "../../kit/Icon.svelte";
  import SongRow from "../SongRow.svelte";
  import Quick from "../Quick.svelte";
  import { COLLECTIONS } from "../data";

  let { id }: { id: string } = $props();
  const c = $derived(COLLECTIONS[id]);
  const key = $derived(`header:${id}`);
</script>

<div class="page">
  <div class="bg" style="background: radial-gradient(120% 70% at 30% 0%, {c.art.match(/#[0-9a-f]{6}/i)?.[0]}55, transparent 70%)"></div>
  <div class="cols">
    <div class="header" data-item={key}>
      {#if c.kind === "album"}<div class="artist"><span class="dot" style="background:{c.art}"></span>{c.by}</div>{/if}
      <div class="art" style="background:{c.art}"></div>
      <h1>{c.title}</h1>
      {#if c.kind === "playlist"}<div class="owner">{c.by}</div>{/if}
      <div class="meta">{c.kind === "album" ? "Album" : "Playlist"} • {c.year ?? "2026"}</div>
      <div class="meta">{c.songs.length} songs • {c.songs.length * 4} minutes</div>
      <div class="actions">
        <span class="own tonal" title="Save to library (YouTube Music's)"><Icon name="library" /></span>
        <span class="own playbig" title="Play (YouTube Music's)"><Icon name="play" size={32} /></span>
        <Quick itemKey={key} place="header" />
        <span class="own tonal" title="Action menu (YouTube Music's)"><Icon name="more" /></span>
      </div>
    </div>
    <div class="tracks" role="list">
      {#each c.songs as sid, i}
        <SongRow songId={sid} ctx={id} layout={c.kind === "album" ? "album" : "wide"} index={i + 1} />
      {/each}
    </div>
  </div>
</div>

<style>
  .page {
    position: relative;
    min-height: 100%;
  }
  .bg {
    position: absolute;
    inset: -64px 0 0 0;
    pointer-events: none;
  }
  .cols {
    position: relative;
    display: flex;
    gap: 40px;
    padding: 64px 52px 48px 68px;
  }
  .header {
    width: 261px;
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .artist {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 16px;
    margin-bottom: 14px;
  }
  .dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
  }
  .art {
    width: 245px;
    height: 245px;
    border-radius: 8px;
  }
  h1 {
    font: 700 28px/34px "YouTube Sans", Roboto, sans-serif;
    margin: 18px 0 10px;
  }
  .owner {
    font-size: 12px;
    margin-bottom: 8px;
  }
  .meta {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.7);
    line-height: 20px;
  }
  .actions {
    margin-top: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    white-space: nowrap;
  }
  .own {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }
  .tonal {
    background: rgba(255, 255, 255, 0.1);
  }
  .playbig {
    width: 64px;
    height: 64px;
    background: #fff;
    color: #030303;
    margin: 0 20px;
  }
  .tracks {
    flex: 1;
    min-width: 0;
    padding-top: 0;
  }
</style>
