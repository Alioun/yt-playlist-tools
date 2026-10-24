<script lang="ts">
  import { BitsConfig, Popover } from "bits-ui"
  let { portalTarget }: { portalTarget: HTMLElement } = $props()
</script>
<BitsConfig defaultPortalTo={portalTarget}>
  <Popover.Root>
    <Popover.Trigger>Open lazy popover</Popover.Trigger>
    <Popover.Portal>
      <Popover.Content class="fixture-popover" strategy="fixed" sideOffset={8}>
        <input aria-label="Lazy input" />
        <p>Real Bits UI</p>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
</BitsConfig>
<style>:global(.fixture-popover) { background: rgb(240, 245, 250); padding: 12px; }</style>
