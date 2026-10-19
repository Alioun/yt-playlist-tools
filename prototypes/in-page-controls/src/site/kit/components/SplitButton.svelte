<script lang="ts">
  // The kit's split button (ticket 17): one click on the main part, a narrow ▾ that opens the playlist picker.
  // Without a quick-save playlist the ▾ isn't drawn and the main part opens the picker in choose mode (ticket 26).
  import IconButton, { type ButtonState } from "./IconButton.svelte";
  import type { IconName } from "../icons/icons";

  let {
    icon,
    label,
    tip = label,
    state = "idle",
    more = true,
    moreLabel,
    moreTip = moreLabel,
    expanded = false,
    onmain,
    onmore,
    onmorehover,
  }: {
    icon: IconName;
    label: string;
    tip?: string;
    state?: ButtonState;
    more?: boolean;
    moreLabel: string;
    moreTip?: string;
    expanded?: boolean;
    onmain: (e: MouseEvent) => void;
    onmore: (e: MouseEvent) => void;
    onmorehover?: () => void;
  } = $props();
</script>

<span class="split" role="group" aria-label={label}>
  <IconButton {icon} {label} {tip} {state} part={more ? "main" : "solo"} onclick={onmain} />
  {#if more}
    <IconButton icon="dropDown" label={moreLabel} tip={moreTip} part="more" {expanded} onclick={onmore} onpointerenter={onmorehover} />
  {/if}
</span>

<style>
  .split {
    display: inline-flex;
  }
</style>
