<script lang="ts" generics="P extends Record<string, unknown>">
  // Loads a component on first render and shows it once it's there (ticket 24: nothing lazy is preloaded).
  // A plain effect instead of {#await}, which keeps Svelte's await block out of the popup's first view.
  import type { Component } from "svelte";
  let { load, props = {} as P }: { load: () => Promise<{ default: Component<P> }>; props?: P } = $props();
  let C = $state<Component<P> | null>(null);
  $effect(() => {
    let live = true;
    load().then((m) => live && (C = m.default));
    return () => (live = false);
  });
</script>

{#if C}<C {...props} />{/if}
