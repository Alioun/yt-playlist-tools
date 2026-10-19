<script lang="ts">
  // Asked before the first feature is switched on while consent is missing (store rule, ticket 03).
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import Disclosure from "./Disclosure.svelte";

  let {
    open = $bindable(false),
    title = "Before this feature can run",
    agreeLabel = "Agree",
    onagree,
    readOnly = false,
  }: { open?: boolean; title?: string; agreeLabel?: string; onagree?: () => void; readOnly?: boolean } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>How Playlist Tools handles your data:</Dialog.Description>
    </Dialog.Header>
    <Disclosure />
    <p class="text-muted-foreground text-xs">Full privacy policy: <a class="text-primary underline" href="#privacy">Privacy policy</a></p>
    <Dialog.Footer>
      {#if readOnly}
        <Button variant="outline" onclick={() => (open = false)}>Close</Button>
      {:else}
        <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
        <Button
          onclick={() => {
            open = false;
            onagree?.();
          }}>{agreeLabel}</Button
        >
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
