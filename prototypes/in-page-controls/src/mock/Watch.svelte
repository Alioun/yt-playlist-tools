<script lang="ts">
  // YouTube's watch page in its own markup (live, 2026-10-19): ytd-watch-metadata › #actions › ytd-menu-renderer with
  // #top-level-buttons-computed (like|dislike, Share), #flexible-item-buttons (Save) and the "…" button. YouTube folds
  // its flexible Save into "…" when the row runs out of room; this mock does the same, counting our pill's width as
  // YouTube's own folding does.
  import { onMount } from "svelte";
  import YIcon from "./YIcon.svelte";
  import Card from "./Card.svelte";
  import { Y } from "./yt-icons";
  import { thumb, videos, watchVideo } from "./data";
  import { mock } from "./mock.svelte";
  import { toasts } from "$kit";

  let menuEl: HTMLElement | undefined = $state();
  let foldedAt = 0;

  function fit() {
    if (!menuEl) return;
    // The row is right-aligned, so it overflows to the left, which scrollWidth doesn't count.
    const first = menuEl.firstElementChild as HTMLElement | null;
    const last = menuEl.lastElementChild as HTMLElement | null;
    const box = menuEl.getBoundingClientRect();
    const over = !!first && first.getBoundingClientRect().left < box.left - 1;
    const used = first && last ? last.getBoundingClientRect().right - first.getBoundingClientRect().left : 0;
    if (!mock.saveFolded && over) {
      mock.saveFolded = true;
      foldedAt = menuEl.clientWidth;
    } else if (mock.saveFolded && used + 100 <= box.width) {
      mock.saveFolded = false;
      requestAnimationFrame(fit);
    }
    void foldedAt;
  }

  onMount(() => {
    const ro = new ResizeObserver(() => requestAnimationFrame(fit));
    ro.observe(menuEl!);
    ro.observe(menuEl!.querySelector("#top-level-buttons-computed")!);
    const mo = new MutationObserver(() => requestAnimationFrame(fit));
    mo.observe(menuEl!, { childList: true, subtree: true, attributes: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  });

  function fullscreen() {
    mock.fullscreen = !mock.fullscreen;
    // YouTube makes <html> the fullscreen element (live probe); the toaster reads this stand-in.
    toasts.simFullscreen = mock.fullscreen ? document.documentElement : null;
    document.dispatchEvent(new Event("fullscreenchange"));
  }
</script>

<ytd-watch-flexy video-id={watchVideo.id} class="watch" class:fs={mock.fullscreen}>
  <div id="columns" class="cols">
    <div id="primary" class="primary">
      <div id="player" class="player-wrap">
        <ytd-player id="ytd-player">
          <div id="movie_player" class="html5-video-player frame" data-pp-player style:background={thumb(18)}>
            <div class="scene"></div>
            <div class="controls">
              <div class="progress"><span style="width:32%"></span></div>
              <div class="row">
                <span class="cb"><YIcon d={Y.playFilled} /></span>
                <span class="time">6:01 / 18:42</span>
                <span class="spacer"></span>
                <button type="button" class="cb" aria-label="Full screen (f)" onclick={fullscreen}><YIcon d={Y.fullscreen} /></button>
              </div>
            </div>
          </div>
        </ytd-player>
      </div>
      <ytd-watch-metadata class="meta">
        <div id="title"><h1>{watchVideo.title}</h1></div>
        <div id="top-row" class="toprow">
          <div id="owner" class="owner">
            <span class="avatar" style:background={thumb(200)}></span>
            <div class="who">
              <ytd-channel-name><a href="/@bytesized" onclick={(e) => e.preventDefault()}>{watchVideo.channel}</a></ytd-channel-name>
              <div class="subs">1.2M subscribers</div>
            </div>
            <span class="subscribe">Subscribe</span>
          </div>
          <div id="actions" class="actions">
            <div id="actions-inner">
              <div id="menu">
                <ytd-menu-renderer class="menu" bind:this={menuEl}>
                  <div id="top-level-buttons-computed" class="top">
                    <segmented-like-dislike-button-view-model class="seg">
                      <button type="button" class="b l"><YIcon d={Y.like} /><span>12K</span></button>
                      <button type="button" class="b r" aria-label="Dislike"><YIcon d={Y.dislike} /></button>
                    </segmented-like-dislike-button-view-model>
                    <button type="button" class="b"><YIcon d={Y.share} /><span>Share</span></button>
                  </div>
                  <div id="flexible-item-buttons" class="flexi">
                    {#if !mock.saveFolded}
                      <button type="button" class="b" aria-label="Save to playlist"><YIcon d={Y.bookmark} /><span>Save</span></button>
                    {/if}
                  </div>
                  <yt-button-shape id="button-shape">
                    <button type="button" class="b more" aria-label="More actions"><YIcon d={Y.more} /></button>
                  </yt-button-shape>
                </ytd-menu-renderer>
              </div>
            </div>
          </div>
        </div>
        <div id="description" class="desc">
          <b>412K views · 3 days ago</b>
          <p>A walk through what a UI compiler emits: how components become direct DOM updates, and why that keeps pages light.</p>
        </div>
      </ytd-watch-metadata>
      <div class="comments"><h2>1,024 Comments</h2></div>
    </div>
    <div id="secondary" class="secondary">
      {#each videos.slice(1, 9) as v (v.id)}<Card {v} compact />{/each}
    </div>
  </div>
</ytd-watch-flexy>

<style>
  .watch {
    display: block;
  }
  .cols {
    display: flex;
    gap: 24px;
    max-width: 1754px;
  }
  .primary {
    flex: 1;
    min-width: 0;
  }
  .secondary {
    width: 402px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  @media (max-width: 1000px) {
    .cols {
      flex-direction: column;
    }
    .secondary {
      width: auto;
    }
  }
  .frame {
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: 12px;
    overflow: hidden;
  }
  .scene {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 30% 40%, rgba(255, 255, 255, 0.25), transparent 40%),
      radial-gradient(circle at 70% 65%, rgba(0, 0, 0, 0.35), transparent 50%);
  }
  .controls {
    position: absolute;
    inset: auto 0 0 0;
    padding: 0 12px;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.55));
    color: #fff;
  }
  .progress {
    height: 3px;
    background: rgba(255, 255, 255, 0.3);
  }
  .progress span {
    display: block;
    height: 100%;
    background: #f03;
  }
  .row {
    height: 48px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cb {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    color: #fff;
    cursor: pointer;
  }
  .time {
    font: 400 1.3rem Roboto, Arial, sans-serif;
  }
  .spacer {
    flex: 1;
  }
  .watch.fs .player-wrap {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: #000;
  }
  .watch.fs .frame {
    width: 100vw;
    height: 100vh;
    aspect-ratio: auto;
    border-radius: 0;
  }
  h1 {
    margin: 12px 0 0;
    font: 700 2rem/2.8rem Roboto, Arial, sans-serif;
  }
  .toprow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 12px;
  }
  @media (max-width: 600px) {
    .toprow {
      flex-direction: column;
      align-items: stretch;
    }
  }
  .owner {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: none;
  }
  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
  }
  .who a {
    color: var(--m-text);
    text-decoration: none;
    font: 500 1.6rem/2.2rem Roboto, Arial, sans-serif;
  }
  .subs {
    color: var(--m-text2);
    font: 400 1.2rem/1.8rem Roboto, Arial, sans-serif;
  }
  .subscribe {
    height: 36px;
    padding: 0 16px;
    margin-left: 12px;
    display: flex;
    align-items: center;
    border-radius: 18px;
    background: var(--m-inv);
    color: var(--m-inv-text);
    font: 500 1.4rem Roboto, Arial, sans-serif;
  }
  .actions {
    flex: 1 1 auto;
    min-width: 0;
  }
  .menu {
    display: flex;
    justify-content: flex-end;
    overflow: hidden;
  }
  .top,
  .flexi,
  .seg {
    display: flex;
    flex: none;
  }
  .b {
    height: 40px;
    margin-left: 8px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    gap: 6px;
    flex: none;
    border: 0;
    border-radius: 20px;
    background: var(--m-tonal);
    color: var(--m-text);
    font: 500 1.4rem/4rem Roboto, Arial, sans-serif;
    white-space: nowrap;
    cursor: pointer;
  }
  .b:hover {
    background: var(--m-tonal-hover);
  }
  .seg .b {
    margin: 0;
  }
  .seg .l {
    border-radius: 20px 0 0 20px;
    margin-left: 8px;
    position: relative;
  }
  .seg .l::after {
    content: "";
    position: absolute;
    right: 0;
    top: 8px;
    height: 24px;
    width: 1px;
    background: var(--m-outline);
  }
  .seg .r {
    border-radius: 0 20px 20px 0;
    padding: 0 16px 0 12px;
  }
  .more {
    width: 40px;
    padding: 0;
    justify-content: center;
  }
  .desc {
    margin-top: 12px;
    padding: 12px;
    border-radius: 12px;
    background: var(--m-tonal);
    font: 400 1.4rem/2rem Roboto, Arial, sans-serif;
  }
  .desc p {
    margin: 4px 0 0;
  }
  .comments h2 {
    font: 700 2rem/2.8rem Roboto, Arial, sans-serif;
    margin: 24px 0;
  }
</style>
