<script lang="ts">
  import { BitsConfig, Popover } from "bits-ui"
  import { createCounter } from "./counter.svelte"

  let { portalTarget }: { portalTarget: HTMLElement } = $props()
  const counter = createCounter()
</script>

<BitsConfig defaultPortalTo={portalTarget}>
  <button class="counter" onclick={() => counter.increment()}>Count {counter.value}</button>
  <Popover.Root>
    <Popover.Trigger>Open pilot popover</Popover.Trigger>
    <Popover.Portal>
      <Popover.Content class="pilot-popover" strategy="fixed" sideOffset={8}>
        <p>Svelte pilot popover</p>
        <Popover.Close>Close pilot popover</Popover.Close>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
</BitsConfig>

<style>
  .counter {
    color: rgb(20, 80, 140);
    border: 2px solid currentColor;
    padding: 8px 12px;
  }
  :global(.pilot-popover) {
    background: rgb(240, 245, 250);
    color: rgb(20, 30, 40);
    border: 2px solid rgb(20, 80, 140);
    padding: 12px;
  }
</style>
