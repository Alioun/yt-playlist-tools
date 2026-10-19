<script lang="ts">
  // A YouTube lockup card in YouTube's own markup and look (live, 2026-10-19): the same tags and camelCase classes, so
  // the real site core recognises it. YouTube's own hover toggles (Watch later, Add to queue) appear top right when
  // the "YouTube draws its own hover toggles" bucket is on.
  import YIcon from "./YIcon.svelte";
  import { Y } from "./yt-icons";
  import { thumb, type MockVideo } from "./data";
  import { mock } from "./mock.svelte";
  import { openYtMenu, goWatch } from "./nav";

  let { v, compact = false }: { v: MockVideo; compact?: boolean } = $props();
  let hover = $state(false);
</script>

<ytd-rich-item-renderer class="item" class:compact role="none" onpointerenter={() => (hover = true)} onpointerleave={() => (hover = false)}>
  <div id="content">
    <yt-lockup-view-model class="lockup">
      <div class="ytLockupViewModelHost" class:ytLockupViewModelVertical={!compact} class:ytLockupViewModelHorizontal={compact}>
        <a class="ytLockupViewModelContentImage" href={`/watch?v=${v.id}`} onclick={(e) => (e.preventDefault(), goWatch())}>
          <yt-thumbnail-view-model class="thumb" style:background={thumb(v.hue)}>
            <span class="badge" class:live={v.live}>{v.len}</span>
            {#if mock.ytToggles && hover}
              <span class="yt-toggles">
                <button type="button" aria-label="Watch later" title="Watch later" onclick={(e) => e.preventDefault()}><YIcon d={Y.clock} size={24} /></button>
                <button type="button" aria-label="Add to queue" title="Add to queue" onclick={(e) => e.preventDefault()}><YIcon d={Y.queue} size={24} /></button>
              </span>
            {/if}
          </yt-thumbnail-view-model>
        </a>
        <div class="meta">
          <yt-lockup-metadata-view-model class="mvm">
            {#if !compact}<a class="avatar" href="/@channel" aria-label={v.channel} style:background={thumb(v.hue + 160)} onclick={(e) => e.preventDefault()}></a>{/if}
            <div class="text">
              <h3><a class="ytLockupMetadataViewModelTitle" href={`/watch?v=${v.id}`} title={v.title} onclick={(e) => (e.preventDefault(), goWatch())}>{v.title}</a></h3>
              <div class="sub">
                <a class="chan" href="/@channel" onclick={(e) => e.preventDefault()}>{v.channel}</a>
                <div>{v.views}{v.age ? ` • ${v.age}` : ""}</div>
              </div>
            </div>
            <div class="ytLockupMetadataViewModelMenuButton">
              <button type="button" aria-label="More actions" onclick={(e) => openYtMenu(e.currentTarget as HTMLElement)}><YIcon d={Y.vert} /></button>
            </div>
          </yt-lockup-metadata-view-model>
        </div>
      </div>
    </yt-lockup-view-model>
  </div>
</ytd-rich-item-renderer>

<style>
  .item {
    display: block;
    min-width: 0;
  }
  .lockup {
    display: block;
    position: relative;
  }
  .ytLockupViewModelHost {
    display: flex;
    flex-direction: column;
  }
  .compact .ytLockupViewModelHost {
    flex-direction: row;
    gap: 8px;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  .ytLockupViewModelContentImage {
    display: block;
    flex: none;
  }
  .thumb {
    display: block;
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: 12px;
    overflow: hidden;
  }
  .compact .thumb {
    width: 168px;
    border-radius: 8px;
  }
  .badge {
    position: absolute;
    right: 8px;
    bottom: 8px;
    padding: 1px 4px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font: 500 1.2rem/1.8rem Roboto, Arial, sans-serif;
  }
  .badge.live {
    background: #c00;
  }
  .yt-toggles {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 200;
  }
  .yt-toggles button {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.3);
    color: #fff;
    cursor: pointer;
  }
  .meta {
    min-width: 0;
  }
  .mvm {
    display: flex;
    gap: 12px;
    padding-top: 12px;
  }
  .compact .mvm {
    padding-top: 0;
  }
  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    flex: none;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  h3 {
    margin: 0 0 4px;
    font: 500 1.6rem/2.2rem Roboto, Arial, sans-serif;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .compact h3 {
    font-size: 1.4rem;
    line-height: 2rem;
  }
  .sub {
    color: var(--m-text2);
    font: 400 1.4rem/2rem Roboto, Arial, sans-serif;
  }
  .compact .sub {
    font-size: 1.2rem;
    line-height: 1.8rem;
  }
  .ytLockupMetadataViewModelMenuButton button {
    width: 40px;
    height: 40px;
    margin: -8px -8px 0 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--m-text);
    cursor: pointer;
  }
  .ytLockupMetadataViewModelMenuButton button:hover {
    background: var(--m-tonal);
  }
</style>
