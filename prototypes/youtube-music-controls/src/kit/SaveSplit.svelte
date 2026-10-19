<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). Save to playlist as a split button: the main half saves to the quick-save
  // playlist in one click, ▾ opens the playlist picker. Without a quick-save playlist it's one button that opens the
  // picker in choose mode (ticket 26).
  import Icon from "./Icon.svelte";
  import Spinner from "./Spinner.svelte";
  import type { ButtonState, Place } from "./model";
  import { showTip, hideTip } from "./tooltip.svelte";

  let {
    place,
    title,
    quickSave,
    status = "idle",
    open = false,
    tipMain,
    tipMenu,
    onsave,
    onmenu,
    onintent,
  }: {
    place: Place;
    title: string;
    quickSave: { title: string } | null;
    status?: ButtonState;
    /** The picker is open from this button. */
    open?: boolean;
    tipMain: string;
    tipMenu: string;
    onsave: (el: HTMLElement) => void;
    onmenu: (el: HTMLElement) => void;
    /** Pointer reached Save: inject the lazy picker now (ticket 24's hover intent). */
    onintent?: () => void;
  } = $props();

  let mainEl: HTMLButtonElement | undefined = $state();
  let menuEl: HTMLButtonElement | undefined = $state();
  let root: HTMLElement | undefined = $state();
  const size = $derived(place === "wiz" || place === "card" ? 20 : 24);

  function stop(e: Event) {
    e.stopPropagation();
    e.preventDefault();
  }
</script>

<span class="split {place}" class:open class:single={!quickSave} bind:this={root} role="group" aria-label="Save to playlist" onpointerenter={() => onintent?.()}>
  <button
    bind:this={mainEl}
    type="button"
    class="half main"
    aria-label={quickSave ? `Save "${title}" to ${quickSave.title}` : `Save "${title}" to playlist…`}
    aria-haspopup={quickSave ? undefined : "dialog"}
    aria-expanded={quickSave ? undefined : open}
    aria-busy={status === "busy" || undefined}
    onpointerdown={(e) => e.stopPropagation()}
    onclick={(e) => {
      stop(e);
      if (status === "busy") return;
      quickSave ? onsave(mainEl!) : onmenu(root!);
    }}
    onpointerenter={() => showTip(mainEl!, tipMain)}
    onpointerleave={hideTip}
    onfocus={() => showTip(mainEl!, tipMain)}
    onblur={hideTip}
  >
    {#if status === "busy"}<Spinner size={size - 4} />{:else if status === "done"}<Icon name="saved" {size} />{:else if status === "failed"}<Icon name="error" {size} />{:else}<Icon name="save" {size} />{/if}
  </button>
  {#if quickSave}
    <span class="divider" aria-hidden="true"></span>
    <button
      bind:this={menuEl}
      type="button"
      class="half menu"
      aria-label={`Save "${title}" to playlist…`}
      aria-haspopup="dialog"
      aria-expanded={open}
      onpointerdown={(e) => e.stopPropagation()}
      onclick={(e) => {
        stop(e);
        onmenu(root!);
      }}
      onpointerenter={() => showTip(menuEl!, tipMenu)}
      onpointerleave={hideTip}
      onfocus={() => showTip(menuEl!, tipMenu)}
      onblur={hideTip}
    >
      <Icon name="dropDown" size={20} />
    </button>
  {/if}
</span>

<style>
  .split {
    display: inline-flex;
    align-items: center;
    flex: none;
    height: 36px;
    border-radius: 18px;
    color: #fff;
    position: relative;
    transition: background-color 0.1s;
  }
  .split:hover,
  .split.open {
    background: rgba(255, 255, 255, 0.1);
  }
  .half {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .main {
    width: 36px;
    border-radius: 18px 0 0 18px;
    padding-left: 2px;
  }
  .single .main {
    border-radius: 50%;
    padding-left: 0;
  }
  .menu {
    width: 22px;
    border-radius: 0 18px 18px 0;
    padding-right: 2px;
  }
  .half:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .half:active {
    background: rgba(255, 255, 255, 0.2);
  }
  .half:focus-visible {
    outline: 2px solid #fff;
    outline-offset: -2px;
  }
  .divider {
    width: 1px;
    height: 20px;
    background: rgba(255, 255, 255, 0.2);
    opacity: 0;
    transition: opacity 0.1s;
  }
  .split:hover .divider,
  .split.open .divider,
  .split:focus-within .divider {
    opacity: 1;
  }
  /* Song and video cards: on the art, in the card play button's black-at-60 % surface, 32 px like our other card buttons. */
  .card {
    height: 32px;
    border-radius: 16px;
    background: rgba(0, 0, 0, 0.6);
  }
  .card:hover,
  .card.open {
    background: rgba(0, 0, 0, 0.85);
  }
  .card .main {
    width: 32px;
    border-radius: 16px 0 0 16px;
  }
  .card.single .main {
    border-radius: 50%;
  }
  .card .menu {
    width: 20px;
    border-radius: 0 16px 16px 0;
  }
  .card .divider {
    opacity: 1;
    height: 16px;
  }
  /* Wiz miniplayer: size S tonal pill, the same shape as its segmented like/dislike. */
  .wiz {
    height: 32px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.1);
  }
  .wiz:hover,
  .wiz.open {
    background: rgba(255, 255, 255, 0.14);
  }
  .wiz .main {
    width: 34px;
    border-radius: 16px 0 0 16px;
  }
  .wiz.single .main {
    width: 32px;
    border-radius: 50%;
  }
  .wiz .menu {
    width: 22px;
    border-radius: 0 16px 16px 0;
  }
  .wiz .divider {
    opacity: 1;
    height: 16px;
  }
</style>
