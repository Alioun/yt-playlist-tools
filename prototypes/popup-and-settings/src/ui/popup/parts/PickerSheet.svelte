<script lang="ts">
  import "./parts.css";
  // The picker as a sheet over the popup's body, under the header (360 px leaves no room for a popover beside its
  // button). Loads on first use with the picker (ticket 24).
  import PlaylistPicker from "$ui/components/picker/PlaylistPicker.svelte";
  import type { PickerRequest } from "$ui/components/picker/request";
  let { req, onclose }: { req: PickerRequest; onclose: () => void } = $props();
</script>

<div class="absolute inset-x-0 top-[58px] bottom-0 z-30 flex flex-col">
  <button type="button" class="bg-foreground/10 absolute inset-0 backdrop-blur-[1px]" aria-label="Close" onclick={onclose}></button>
  <div
    class="animate-in slide-in-from-bottom-6 fade-in-0 relative mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl border border-b-0 shadow-float duration-200"
  >
    {#key req}
      <PlaylistPicker {req} {onclose} />
    {/key}
  </div>
</div>
