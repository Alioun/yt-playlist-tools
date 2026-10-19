<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). The A/B-tested Wiz miniplayer (ytmusic-miniplayer), as forced on with
  // music_web_enable_wiz_miniplayer on real music.youtube.com: track info left, controls centred, then time, the
  // video action bar (segmented like/dislike, signed in only), volume and ⋮ as size-S tonal circles.
  import Icon from "../kit/Icon.svelte";
  import BarSave from "./BarSave.svelte";
  import { playingSong, liked, settings } from "./store.svelte";
  const song = $derived(playingSong());
</script>

<div class="wiz" data-player-bar data-item="bar">
  <div class="progress"><span style="width:23%"></span></div>
  <div class="ls">
    {#if song}
      <span class="art" class:video={song.video} style="background:{song.art}"></span>
      <div class="info">
        <div class="t">{song.title}</div>
        <div class="b">{song.artist} • {song.album} • 2025</div>
      </div>
    {/if}
  </div>
  <div class="ms">
    <span class="c"><Icon name="shuffle" /></span>
    <span class="c"><Icon name="previous" /></span>
    <span class="c play"><Icon name="pause" /></span>
    <span class="c"><Icon name="next" /></span>
    <span class="c"><Icon name="repeat" /></span>
  </div>
  <div class="rs">
    <span class="time">1:24 / {song?.duration ?? "0:00"}</span>
    {#if settings.signedIn && song}
      <BarSave place="wiz" />
      <span class="seg" title="YouTube Music's own like and dislike (the video action bar)">
        <span class="sh"><Icon name={liked[song.id] ? "liked" : "like"} size={20} /></span>
        <span class="sd"></span>
        <span class="sh"><Icon name="dislike" size={20} /></span>
      </span>
    {/if}
    <span class="tc"><Icon name="volume" size={20} /></span>
    <span class="tc"><Icon name="more" size={20} /></span>
  </div>
</div>

<style>
  .wiz {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: 72px;
    background: #212121;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    z-index: 20;
    color: #fff;
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
  .ls {
    display: flex;
    align-items: center;
    padding-left: 16px;
    min-width: 0;
  }
  .art {
    width: 48px;
    height: 48px;
    border-radius: 4px;
    flex: none;
  }
  .art.video {
    width: 85px;
  }
  .info {
    margin-left: 16px;
    min-width: 0;
    font-size: 14px;
    line-height: 20px;
  }
  .t {
    font-weight: 500;
    font-size: 15px;
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
  .ms {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .c {
    width: 48px;
    height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }
  .c.play {
    background: rgba(255, 255, 255, 0.1);
  }
  .rs {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding-right: 16px;
  }
  .time {
    font-size: 14px;
    color: #aaa;
    margin-right: 8px;
    white-space: nowrap;
  }
  .tc {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .seg {
    height: 32px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.1);
    display: inline-flex;
    align-items: center;
  }
  .sh {
    width: 40px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .sd {
    width: 1px;
    height: 16px;
    background: rgba(255, 255, 255, 0.2);
  }
</style>
