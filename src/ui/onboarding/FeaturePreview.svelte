<script lang="ts">
  import Glyph from "../components/Glyph.svelte"
  import type { PageFeatureId } from "./features"
  import type { createFeatureExamples } from "./examples"

  let { id, example, text }: { id: PageFeatureId; example: string; text: ReturnType<typeof createFeatureExamples>["text"] } = $props()
</script>

<span class="feature-preview" data-feature-preview={id}>
  <span class="scene" aria-hidden="true">
    {#if id === "quick-save" || id === "queue-button" || id === "card-menu"}
      <span class="thumbnail">
        <Glyph name="circle-play" class="play" />
        {#if id !== "card-menu"}<span class="thumbnail-action" class:queue={id === "queue-button"}><Glyph name={id === "quick-save" ? "bookmark" : "list-end"} class="icon" />{#if id === "quick-save"}<Glyph name="chevron-down" class="caret" />{/if}</span>{/if}
      </span>
      {#if id === "card-menu"}
        <span class="mini-menu"><span><Glyph name="list-end" class="icon" />{text.queue}</span><span><Glyph name="bookmark" class="icon" />{text.save}</span></span>
      {:else}<span class="scene-copy">{text.video}<span class="action-hint"><Glyph name={id === "quick-save" ? "bookmark" : "list-end"} class="icon" />{id === "quick-save" ? text.save : text.queue}</span></span>{/if}
    {:else if id === "auto-add" || id === "watch-button"}
      <span class="mini-watch"><span class="watch-screen"><Glyph name="circle-play" class="play" /><span class="progress"></span></span><span class="watch-title">{text.video}</span></span>
      <span class="action-pill"><Glyph name={id === "auto-add" ? "circle-check" : "bookmark"} class="icon" />{id === "auto-add" ? text.playlist : text.save}</span>
    {:else if id === "browser-menu"}
      <span class="thumbnail compact"><Glyph name="pointer" class="play" /></span>
      <span class="mini-menu"><span>{text.save}<Glyph name="chevron-right" class="icon" /></span><span class="menu-selection"><Glyph name="bookmark" class="icon" />{text.playlist}</span></span>
    {:else if id === "gather"}
      <span class="tab-stack"><span>▶</span><span>▶</span><span>▶</span></span><Glyph name="arrow-right" class="arrow" /><span class="action-pill"><Glyph name="list-plus" class="icon" />{text.playlist}</span>
    {:else if id === "music-actions"}
      <span class="album"><Glyph name="music" class="play" /></span><span class="scene-copy">{text.video}<span class="music-actions"><span><Glyph name="list-plus" class="icon" />{text.playNext}</span><span><Glyph name="bookmark" class="icon" /></span><span><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" /></svg></span></span></span>
    {:else}
      <span class="key"><Glyph name="keyboard" class="icon" />{id === "shortcuts" ? "Alt + W" : text.yourKey}</span><Glyph name="arrow-right" class="arrow" /><span class="action-pill"><Glyph name={id === "music-keys" ? "list-plus" : "bookmark"} class="icon" />{id === "music-keys" ? text.playNext : id === "shortcuts" ? text.playlist : text.save}</span>
    {/if}
  </span>
  <span class="example"><span class="example-label">{text.label}</span> {example}</span>
</span>

<style>
  .feature-preview { display: block; margin-top: 14px; overflow: hidden; border: 1px solid var(--border); border-radius: 10px; font-weight: 400; }
  .scene { display: flex; align-items: center; gap: 14px; min-height: 110px; padding: 16px; background: var(--muted); pointer-events: none; }
  .thumbnail, .watch-screen { position: relative; display: grid; place-items: center; flex-shrink: 0; width: 150px; height: 84px; overflow: hidden; border-radius: 7px; color: #fff; background: linear-gradient(145deg, #284c59, #42345e); }
  .compact { width: 100px; }
  .scene :global(.play) { width: 28px; height: 28px; opacity: .8; }
  .scene :global(.icon) { width: 16px; height: 16px; flex-shrink: 0; }
  .scene :global(.caret) { width: 12px; height: 12px; }
  .scene :global(.arrow) { width: 20px; height: 20px; flex-shrink: 0; color: var(--muted-foreground); }
  .thumbnail-action { position: absolute; top: 5px; left: 5px; display: flex; align-items: center; gap: 5px; border-radius: 4px; padding: 6px; background: #0f0f0fdd; }
  .thumbnail-action.queue { top: auto; bottom: 5px; }
  .scene-copy { display: block; min-width: 0; font-size: 13px; font-weight: 600; }
  .action-hint { display: flex; align-items: center; gap: 5px; margin-top: 7px; color: var(--muted-foreground); font-size: 12px; font-weight: 400; }
  .action-pill, .key { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid var(--border); border-radius: 7px; padding: 9px; background: var(--card); font-size: 12px; }
  .action-pill { color: var(--primary); }
  .mini-watch { display: block; }
  .watch-screen { width: 130px; height: 65px; }
  .progress { position: absolute; bottom: 0; left: 0; height: 3px; width: 72%; background: #f44; }
  .watch-title { display: block; margin-top: 5px; font-size: 11px; }
  .mini-menu { display: block; min-width: 0; padding: 5px; border-radius: 7px; background: var(--card); border: 1px solid var(--border); box-shadow: 0 3px 8px #0001; }
  .mini-menu > span { display: flex; align-items: center; gap: 8px; padding: 5px; font-size: 11px; }
  .menu-selection { color: var(--primary); background: var(--accent); border-radius: 4px; }
  .tab-stack { display: flex; padding-left: 6px; }
  .tab-stack > span { display: grid; place-items: center; width: 38px; height: 48px; margin-left: -6px; border: 2px solid var(--card); border-radius: 6px; background: var(--accent); color: var(--primary); transform: rotate(-6deg); }
  .tab-stack > span:nth-child(2) { transform: rotate(0); }
  .tab-stack > span:nth-child(3) { transform: rotate(6deg); }
  .album { display: grid; place-items: center; width: 64px; height: 64px; flex-shrink: 0; border-radius: 7px; color: #fff; background: #54416b; }
  .music-actions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
  .music-actions > span { display: flex; align-items: center; gap: 5px; border: 1px solid var(--border); border-radius: 5px; padding: 6px; color: var(--primary); background: var(--card); font-size: 11px; }
  .example { display: block; padding: 9px 12px; color: var(--muted-foreground); font-size: 12px; line-height: 1.5; }
  .example-label { color: var(--foreground); font-weight: 600; }
  @media (max-width: 480px) { .scene { flex-wrap: wrap; gap: 10px; } .thumbnail { width: 125px; height: 70px; } }
</style>
