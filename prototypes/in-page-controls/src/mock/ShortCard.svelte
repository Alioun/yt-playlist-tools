<script lang="ts">
  // A Shorts-shelf lockup in YouTube's markup (ytm-shorts-lockup-view-model, live 2026-10-19).
  import YIcon from "./YIcon.svelte";
  import { Y } from "./yt-icons";
  import { thumb } from "./data";
  import { openYtMenu, go } from "./nav";
  let { s }: { s: { id: string; title: string; views: string; hue: number } } = $props();
</script>

<ytm-shorts-lockup-view-model class="short">
  <a class="shortsLockupViewModelHostEndpoint reel-item-endpoint" aria-label={s.title} href={`/shorts/${s.id}`} onclick={(e) => (e.preventDefault(), go("shorts"))}>
    <yt-thumbnail-view-model class="thumb" style:background={thumb(s.hue)}></yt-thumbnail-view-model>
  </a>
  <div class="meta">
    <h3><a class="shortsLockupViewModelHostOutsideMetadataEndpoint" href={`/shorts/${s.id}`} onclick={(e) => e.preventDefault()}>{s.title}</a></h3>
    <div class="sub">{s.views}</div>
    <div class="shortsLockupViewModelHostOutsideMetadataMenu">
      <button type="button" aria-label="More actions" onclick={(e) => openYtMenu(e.currentTarget as HTMLElement)}><YIcon d={Y.vert} size={20} /></button>
    </div>
  </div>
</ytm-shorts-lockup-view-model>

<style>
  .short {
    display: block;
    position: relative;
    min-width: 0;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  .shortsLockupViewModelHostEndpoint {
    display: block;
    position: relative;
  }
  .thumb {
    display: block;
    aspect-ratio: 2 / 3;
    border-radius: 12px;
  }
  .meta {
    position: relative;
    padding: 8px 24px 0 0;
  }
  h3 {
    margin: 0;
    font: 500 1.6rem/2.2rem Roboto, Arial, sans-serif;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .sub {
    color: var(--m-text2);
    font: 400 1.4rem/2rem Roboto, Arial, sans-serif;
  }
  .shortsLockupViewModelHostOutsideMetadataMenu {
    position: absolute;
    right: -8px;
    top: 4px;
  }
  .shortsLockupViewModelHostOutsideMetadataMenu button {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--m-text);
  }
</style>
