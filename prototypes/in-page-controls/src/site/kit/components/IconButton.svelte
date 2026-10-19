<script lang="ts" module>
  export type ButtonState = "idle" | "busy" | "done" | "failed" | "unconfirmed" | "on";
</script>

<script lang="ts">
  // The kit's thumbnail button (ticket 17: IconButton with idle/busy/done/failed/unconfirmed). It sits on the
  // thumbnail in the style of YouTube's own thumbnail overlays (its duration badge): rgba(0,0,0,.6), 4px radius,
  // white glyph. Every state has its own glyph and label, never colour alone (ticket 12).
  import Icon from "../icons/Icon.svelte";
  import type { IconName } from "../icons/icons";

  let {
    icon,
    label,
    tip = label,
    state = "idle",
    part = "solo",
    expanded = undefined,
    showTip = false,
    onclick,
    onpointerenter,
  }: {
    icon: IconName;
    label: string;
    tip?: string;
    state?: ButtonState;
    part?: "solo" | "main" | "more";
    expanded?: boolean;
    /** Prototype states sheet: keep the tooltip visible. */
    showTip?: boolean;
    onclick?: (e: MouseEvent) => void;
    onpointerenter?: (e: PointerEvent) => void;
  } = $props();

  const glyph: IconName = $derived(
    state === "done" ? "check" : state === "failed" ? "error" : state === "unconfirmed" ? "pending" : icon,
  );
</script>

<span class="wrap" class:show={showTip}>
  <button
    type="button"
    class="ib {part}"
    aria-label={label}
    aria-busy={state === "busy"}
    aria-expanded={expanded}
    aria-haspopup={part === "more" ? "dialog" : undefined}
    data-state={state}
    onclick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      onclick?.(e);
    }}
    {onpointerenter}
  >
    {#if state === "busy"}<span class="spin" aria-hidden="true"></span>{:else}<Icon
        name={glyph}
        size={part === "more" ? 20 : 24}
      />{/if}
  </button>
  <span class="tip" role="tooltip">{tip}</span>
</span>

<style>
  .wrap {
    position: relative;
    display: inline-flex;
  }
  /* YouTube's own thumbnail hover toggles (Watch later, Add to queue): 32 px, round, dark translucent, white glyph. */
  .ib {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 16px;
    background: var(--pt-overlay);
    color: #fff;
    cursor: pointer;
    transition: background-color 0.1s;
  }
  .ib:hover {
    background: var(--pt-overlay-hover);
  }
  .ib.main {
    width: 34px;
    padding-left: 2px;
    border-radius: 16px 0 0 16px;
  }
  .ib.more {
    width: 22px;
    padding-right: 2px;
    border-radius: 0 16px 16px 0;
    box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.25);
  }
  .ib:focus-visible {
    outline: 2px solid #fff;
    outline-offset: -2px;
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.6);
  }
  .ib[data-state="busy"] {
    cursor: progress;
  }
  .spin {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid #fff;
    border-right-color: transparent;
    animation: pt-spin 0.8s linear infinite;
  }
  @keyframes pt-spin {
    to {
      transform: rotate(360deg);
    }
  }
  /* YouTube's tooltip: #616161 at .9, 12/18, 8px padding, 4px radius; to the right, so it never covers the stack. */
  .tip {
    position: absolute;
    left: calc(100% + 8px);
    top: 50%;
    transform: translateY(-50%);
    z-index: 3;
    white-space: nowrap;
    padding: 8px;
    border-radius: 4px;
    background: rgba(97, 97, 97, 0.92);
    color: #fff;
    font: 400 1.2rem/1.8rem var(--pt-font);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity 0.1s, visibility 0.1s;
  }
  .wrap:hover .tip,
  .ib:focus-visible + .tip {
    opacity: 1;
    visibility: visible;
    transition-delay: 0.5s;
  }
  .wrap.show .tip {
    opacity: 1;
    visibility: visible;
  }
</style>
