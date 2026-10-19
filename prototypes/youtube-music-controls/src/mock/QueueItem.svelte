<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). A mock of ytmusic-player-queue-item. On hover YouTube Music swaps the duration
  // for its ⋮; ours join the item's layout just before it (variant A).
  import Icon from "../kit/Icon.svelte";
  import Quick from "./Quick.svelte";
  import { SONGS } from "./data";
  import { ui, queue, settings } from "./store.svelte";

  let { qid }: { qid: string } = $props();
  const i = $derived(queue.entries.findIndex((e) => e.qid === qid));
  const e = $derived(queue.entries[i]);
  const s = $derived(SONGS[e.songId]);
  const playing = $derived(i === queue.current);
  const key = $derived(`q:${qid}`);
  let hover = $state(false);
  let focus = $state(false);
  const hot = $derived(hover || focus || ui.forceHover === key || ui.forceFocus === key);
  const v = $derived(ui.variant);
  // A moved item leaves the pointer behind: drop its hover (on real YouTube Music our one host stays with the pointer).
  $effect(() => {
    void i;
    hover = false;
  });
  const reservedW = $derived(
    (settings.buttons.playNext ? 38 : 0) + (settings.buttons.addToQueue ? 38 : 0) + (settings.buttons.save && settings.signedIn ? 60 : 0) + (settings.buttons.like && settings.signedIn ? 38 : 0) + (settings.buttons.remove ? 38 : 0) + 8,
  );
</script>

<div
  class="qi"
  class:playing
  class:hot
  data-item={key}
  role="listitem"
  tabindex="0"
  onpointerenter={() => (hover = true)}
  onpointerleave={() => (hover = false)}
  onfocusin={(ev) => {
    if ((ev.target as HTMLElement).matches(":focus-visible")) focus = true;
  }}
  onfocusout={(ev) => {
    if (!(ev.currentTarget as HTMLElement).contains(ev.relatedTarget as Node)) focus = false;
  }}
  onclick={() => (queue.current = i)}
  onkeydown={(ev) => ev.key === "Enter" && (queue.current = i)}
>
  <div class="left">
    <span class="thumb" class:video={s.video} style="background:{s.art}"></span>
    {#if playing}<span class="ov"><Icon name="volume" size={24} /></span>{:else if hot}<span class="ov"><Icon name="play" size={24} /></span>{/if}
  </div>
  <div class="info">
    <div class="t">{s.title}</div>
    <div class="b">{s.artist}</div>
  </div>
  {#if v === "A" && hot}
    <span class="slot inflow"><Quick itemKey={key} place="queue" /></span>
  {:else if v === "B"}
    <span class="slot reserved" style="width:{reservedW}px">{#if hot}<Quick itemKey={key} place="queue" />{/if}</span>
  {:else if v === "C" && hot}
    <span class="slot pill"><Quick itemKey={key} place="queue" /></span>
  {/if}
  {#if hot}
    <span class="menu"><Icon name="more" /></span>
  {:else}
    <span class="dur">{s.duration}</span>
  {/if}
</div>

<style>
  .qi {
    position: relative;
    display: flex;
    align-items: center;
    height: 57px;
    padding: 0 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 16px;
    line-height: 19.2px;
    cursor: pointer;
    outline: none;
  }
  .qi.playing {
    background: rgba(255, 255, 255, 0.1);
  }
  .qi:focus-visible {
    box-shadow: inset 0 0 0 2px #fff;
  }
  .left {
    position: relative;
    width: 32px;
    height: 32px;
    flex: none;
    margin-right: 16px;
  }
  .thumb {
    position: absolute;
    inset: 0;
    border-radius: 2px;
  }
  .thumb.video {
    inset: 7px 0;
  }
  .ov {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    border-radius: 2px;
  }
  .info {
    flex: 1;
    min-width: 0;
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
    margin-top: 3px;
  }
  .slot {
    flex: none;
    display: inline-flex;
    align-items: center;
  }
  .inflow {
    margin: 0 4px 0 8px;
  }
  .reserved {
    justify-content: flex-end;
  }
  .pill {
    position: absolute;
    right: 52px;
    top: 50%;
    transform: translateY(-50%);
    background: #212121;
    border-radius: 20px;
    padding: 2px;
    box-shadow: -16px 0 16px -4px rgba(3, 3, 3, 0.9), 0 2px 8px rgba(0, 0, 0, 0.5);
  }
  .menu {
    width: 36px;
    height: 36px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 4px;
  }
  .dur {
    width: 39px;
    margin-left: 16px;
    flex: none;
    text-align: right;
    color: rgba(255, 255, 255, 0.7);
  }
</style>
