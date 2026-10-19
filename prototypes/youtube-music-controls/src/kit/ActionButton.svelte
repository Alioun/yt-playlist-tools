<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). One quick-action button in YouTube Music's own look for the place it sits in.
  import Icon from "./Icon.svelte";
  import Spinner from "./Spinner.svelte";
  import type { IconName } from "./icons";
  import type { ButtonState, Place } from "./model";
  import { showTip, hideTip } from "./tooltip.svelte";

  let {
    place,
    icon,
    label,
    tip,
    status = "idle",
    pressed,
    unavailable = false,
    onclick,
    onintent,
  }: {
    place: Place;
    icon: IconName;
    /** Accessible name: the action and the item's title (ticket 26). */
    label: string;
    /** Tooltip: the action's name plus its key. */
    tip: string;
    status?: ButtonState;
    pressed?: boolean;
    /** Casting: dimmed, still hoverable so the tooltip explains why. */
    unavailable?: boolean;
    onclick?: (el: HTMLElement) => void;
    onintent?: () => void;
  } = $props();

  let el: HTMLButtonElement | undefined = $state();
  const iconSize = $derived(place === "card" ? 20 : place === "wiz" ? 20 : 24);
  const shown: IconName | null = $derived(
    status === "done" ? "check" : status === "failed" ? "error" : status === "unconfirmed" ? "hourglass" : status === "busy" ? null : icon,
  );

  function click(e: MouseEvent) {
    // YouTube Music rows, queue items and the Wiz miniplayer act on clicks that reach them: keep ours to ourselves.
    e.stopPropagation();
    e.preventDefault();
    if (unavailable || status === "busy") return;
    onclick?.(el!);
  }
</script>

<button
  bind:this={el}
  type="button"
  class="ab {place}"
  class:unavailable
  class:done={status === "done"}
  class:failed={status === "failed"}
  aria-label={label}
  aria-pressed={pressed}
  aria-disabled={unavailable || undefined}
  aria-busy={status === "busy" || undefined}
  onclick={click}
  onpointerenter={() => {
    showTip(el!, tip);
    onintent?.();
  }}
  onpointerleave={hideTip}
  onfocus={() => showTip(el!, tip)}
  onblur={hideTip}
  onpointerdown={(e) => e.stopPropagation()}
>
  {#if shown}<Icon name={shown} size={iconSize} />{:else}<Spinner size={iconSize - 4} />{/if}
</button>

<style>
  .ab {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    color: #fff;
    cursor: pointer;
    position: relative;
    transition: background-color 0.1s;
    -webkit-tap-highlight-color: transparent;
  }
  .ab:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .ab:active {
    background: rgba(255, 255, 255, 0.2);
  }
  .ab:focus-visible {
    outline: 2px solid #fff;
    outline-offset: -2px;
  }
  /* Cards: YouTube Music's own thumbnail play button (40 px, black at 60 %), one size down so its play stays first. */
  .card {
    background: rgba(0, 0, 0, 0.6);
    width: 32px;
    height: 32px;
  }
  .card:hover {
    background: rgba(0, 0, 0, 0.85);
    transform: scale(1.08);
  }
  .card:active {
    background: #000;
  }
  /* Album and playlist headers: the same 40 px tonal circle as YouTube Music's own Save to library and ⋮. */
  .header {
    width: 40px;
    height: 40px;
    background: rgba(255, 255, 255, 0.1);
  }
  .header:hover {
    background: rgba(255, 255, 255, 0.2);
  }
  /* The Wiz miniplayer's size-S tonal buttons. */
  .wiz {
    width: 32px;
    height: 32px;
    background: rgba(255, 255, 255, 0.1);
  }
  .wiz:hover {
    background: rgba(255, 255, 255, 0.2);
  }
  .unavailable {
    opacity: 0.38;
    cursor: default;
  }
  .unavailable:hover,
  .unavailable:active {
    background: transparent;
  }
  .card.unavailable:hover {
    background: rgba(0, 0, 0, 0.6);
    transform: none;
  }
  .failed {
    color: #ff8a80;
  }
</style>
