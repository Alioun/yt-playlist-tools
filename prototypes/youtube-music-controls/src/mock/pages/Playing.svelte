<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). The player page with its Up next queue (ytmusic-player-queue), 392 px wide at
  // a 1440 px window. In fullscreen YouTube Music fullscreens the whole document and overlays the player bar.
  import QueueItem from "../QueueItem.svelte";
  import { queue, playingSong, ui } from "../store.svelte";
  const song = $derived(playingSong());
  const userItems = $derived(queue.entries.filter((e) => !e.autoplay));
  const autoplay = $derived(queue.entries.filter((e) => e.autoplay));
</script>

<div class="pp" class:fs={ui.fullscreen}>
  <div class="player">
    <div class="art" class:video={song?.video} style="background:{song?.art}">
      {#if song}<span class="cap">{song.title}</span>{/if}
    </div>
  </div>
  {#if !ui.fullscreen}
    <aside class="side">
      <div class="tabs"><span class="tab on">UP NEXT</span><span class="tab">LYRICS</span><span class="tab">RELATED</span></div>
      <div class="from">
        <div><div class="pf">Playing from</div><div class="pft">Midnight Overpass Radio</div></div>
        <span class="save">Save</span>
      </div>
      <div class="chips"><span class="chip on">All</span><span class="chip">Familiar</span><span class="chip">Discover</span><span class="chip">Popular</span></div>
      <div class="queue" role="list" aria-label="Up next">
        {#each userItems as e (e.qid)}<QueueItem qid={e.qid} />{/each}
        {#if autoplay.length}
          <div class="auto"><span>Autoplay</span><span class="sw"><span></span></span></div>
          {#each autoplay as e (e.qid)}<QueueItem qid={e.qid} />{/each}
        {/if}
      </div>
    </aside>
  {/if}
</div>

<style>
  .pp {
    position: absolute;
    inset: 64px 0 0 0;
    display: flex;
    gap: 56px;
    padding: 0 56px 0 56px;
  }
  .pp.fs {
    position: fixed;
    inset: 0;
    padding: 0;
    z-index: 15;
    background: #000;
  }
  .player {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
  }
  .art {
    width: min(100%, 480px);
    aspect-ratio: 1;
    border-radius: 4px;
    position: relative;
  }
  .art.video {
    width: min(100%, 640px);
    aspect-ratio: 16 / 9;
  }
  .fs .art {
    width: 100%;
    height: 100%;
    aspect-ratio: auto;
    border-radius: 0;
  }
  .cap {
    position: absolute;
    left: 16px;
    bottom: 12px;
    font: 700 22px "YouTube Sans", Roboto, sans-serif;
    opacity: 0.85;
  }
  .side {
    width: 392px;
    flex: none;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .tabs {
    display: flex;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .tab {
    flex: 1;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    font: 500 14px Roboto, sans-serif;
    color: rgba(255, 255, 255, 0.5);
  }
  .tab.on {
    color: #fff;
    border-bottom: 2px solid #fff;
  }
  .from {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 0 12px;
  }
  .pf {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
  }
  .pft {
    font: 500 16px Roboto, sans-serif;
  }
  .save {
    background: #fff;
    color: #030303;
    border-radius: 18px;
    height: 32px;
    padding: 0 16px;
    display: inline-flex;
    align-items: center;
    font: 500 14px Roboto, sans-serif;
  }
  .chips {
    display: flex;
    gap: 8px;
    padding-bottom: 12px;
  }
  .chip {
    height: 32px;
    padding: 0 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    display: inline-flex;
    align-items: center;
    font-size: 14px;
  }
  .chip.on {
    background: #fff;
    color: #030303;
  }
  .queue {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    padding-bottom: 80px;
  }
  .auto {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 8px 8px;
    font: 500 14px Roboto, sans-serif;
    color: rgba(255, 255, 255, 0.7);
  }
  .sw {
    width: 36px;
    height: 14px;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.5);
    position: relative;
  }
  .sw span {
    position: absolute;
    right: -2px;
    top: -3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
  }
</style>
