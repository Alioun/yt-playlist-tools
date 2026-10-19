<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27, rough dev build). Hosts the picker inside the kit's shadow root.
  import Picker from "../popovers/Picker.svelte";
  import type { PickerModel } from "../popovers/picker-model.svelte";
  let {
    open = $bindable(true),
    model,
    anchor,
    centred,
    portalTo,
    onclose,
  }: { open?: boolean; model: PickerModel; anchor: HTMLElement | { getBoundingClientRect(): DOMRect }; centred: boolean; portalTo: HTMLElement; onclose: () => void } = $props();
  $effect(() => {
    if (!open) onclose();
  });
</script>

<Picker bind:open {model} {anchor} {centred} {portalTo} strategy="fixed" />
