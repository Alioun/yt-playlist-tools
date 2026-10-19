<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). YouTube Music's classic player bar (ytmusic-player-bar), measured at 1440 px:
  // 72 px, #212121, left controls 280 px, middle controls with like, dislike and ⋮ after the title.
  import Icon from "../kit/Icon.svelte";
  import BarSave from "./BarSave.svelte";
  import { playingSong, liked, ui } from "./store.svelte";
  const song = $derived(playingSong());
</script>

<div class="bar" class:fs={ui.fullscreen} data-player-bar data-item="bar">
  <div class="progress"><span style="width:23%"></span></div>
  <div class="left">
    <span class="c"><Icon name="previous" /></span>
    <span class="c pp"><Icon name="pause" size={40} /></span>
    <span class="c"><Icon name="next" /></span>
    <span class="time">1:24 / {song?.duration ?? "0:00"}</span>
  </div>
  <div class="middle">
    {#if song}
      <span class="art" class:video={song.video} style="background:{song.art}"></span>
      <div class="info">
        <div class="t">{song.title}</div>
        <div class="b">{song.artist} • {song.album} • 2025</div>
      </div>
      <BarSave place="bar" />
      <span class="own"><Icon name={liked[song.id] ? "liked" : "like"} /></span>
      <span class="own"><Icon name="dislike" /></span>
      <span class="own menu"><Icon name="more" /></span>
    {/if}
  </div>
  <div class="right">
    <span class="c"><Icon name="volume" /></span>
    <span class="c"><Icon name="repeat" /></span>
    <span class="c"><Icon name="shuffle" /></span>
    <span class="c"><Icon name={ui.fullscreen ? "exitFullscreen" : "collapse"} /></span>
  </div>
</div>

<style>
  .bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: 72px;
    background: #212121;
    display: grid;
    grid-template-columns: 280px 1fr 280px;
    align-items: center;
    z-index: 20;
    color: #fff;
  }
  .bar.fs {
    background: linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.6));
  }
  .progress {
    position: absolute;
    left: 0;
    right: 0;
    top: -1px;
    height: 2px;
    background: rgba(255, 255, 255, 0.1);
  }
  .progress span {
    display: block;
    height: 100%;
    background: #f03;
  }
  .left {
    display: flex;
    align-items: center;
    padding-left: 8px;
  }
  .c {
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .pp {
    width: 52px;
    height: 52px;
    margin: 0 4px;
  }
  .time {
    margin-left: 8px;
    font-size: 12px;
    color: #aaa;
    white-space: nowrap;
  }
  .middle {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: 0 12px;
  }
  .art {
    width: 40px;
    height: 40px;
    border-radius: 2px;
    flex: none;
  }
  .art.video {
    width: 71px;
  }
  .info {
    min-width: 0;
    margin: 0 16px;
    font-size: 16px;
    line-height: 19.2px;
    flex: 0 1 auto;
    max-width: 455px;
  }
  .t {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .b {
    color: rgba(255, 255, 255, 0.7);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .own {
    width: 36px;
    height: 36px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 2px;
  }
  .own.menu {
    margin-left: 8px;
  }
  .right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding-right: 12px;
    color: rgba(255, 255, 255, 0.7);
  }
</style>
