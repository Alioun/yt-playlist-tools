<script lang="ts">
  // YouTube's Shorts player in its own markup (live, 2026-10-19): the action column is reel-action-bar-view-model,
  // 48 px circles with 12/18 labels, ending with the sound (pivot) button. No dislike and no "…" in this bucket.
  import YIcon from "./YIcon.svelte";
  import { Y } from "./yt-icons";
  import { thumb, shorts } from "./data";
  const s = shorts[0];
</script>

<ytd-shorts class="shorts" data-pp-shorts>
  <ytd-reel-video-renderer is-active class="reel">
    <div class="video" data-pp-player style:background={thumb(s.hue)}>
      <div class="info">
        <div class="chan"><span class="av" style:background={thumb(80)}></span>{s.channel}<span class="sub">Subscribe</span></div>
        <div class="title">{s.title}</div>
      </div>
    </div>
    <div class="ytReelPlayerOverlayViewModelActionsContainer">
      <reel-action-bar-view-model class="bar">
        <like-button-view-model class="act"><span class="c"><YIcon d={Y.heart} /></span><span class="l">1.2M</span></like-button-view-model>
        <button-view-model class="act"><span class="c"><YIcon d={Y.comment} /></span><span class="l">3.4K</span></button-view-model>
        <button-view-model class="act"><span class="c"><YIcon d={Y.share} /></span><span class="l">Share</span></button-view-model>
        <button-view-model class="act"><span class="c"><YIcon d={Y.remix} /></span><span class="l">Remix</span></button-view-model>
        <pivot-button-view-model class="pivot" style:background={thumb(260)}></pivot-button-view-model>
      </reel-action-bar-view-model>
    </div>
  </ytd-reel-video-renderer>
</ytd-shorts>

<style>
  .shorts {
    display: flex;
    justify-content: center;
    padding-top: 8px;
  }
  .reel {
    display: flex;
    align-items: flex-end;
    gap: 16px;
  }
  .video {
    position: relative;
    height: calc(100vh - 88px);
    max-height: 820px;
    aspect-ratio: 9 / 16;
    border-radius: 12px;
    overflow: hidden;
  }
  .info {
    position: absolute;
    inset: auto 0 0 0;
    padding: 16px;
    color: #fff;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.5));
    font: 400 1.4rem/2rem Roboto, Arial, sans-serif;
  }
  .chan {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
  }
  .av {
    width: 32px;
    height: 32px;
    border-radius: 50%;
  }
  .sub {
    padding: 0 12px;
    height: 32px;
    display: flex;
    align-items: center;
    border-radius: 16px;
    background: #f1f1f1;
    color: #0f0f0f;
  }
  .title {
    margin-top: 8px;
  }
  .ytReelPlayerOverlayViewModelActionsContainer {
    width: 72px;
  }
  .bar {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .act {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding-bottom: 8px;
  }
  .c {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--m-tonal);
  }
  .l {
    font: 400 1.2rem/1.8rem Roboto, Arial, sans-serif;
  }
  .pivot {
    display: block;
    width: 40px;
    height: 40px;
    margin-top: 16px;
    border-radius: 8px;
  }
</style>
