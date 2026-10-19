<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 14): the in-page controls in YouTube's own look, on mock YouTube pages, in YouTube's
  // light and dark themes. The bottom bar cycles guided scenes (?scene=); the panel switches everything.
  // Variants (?variant=): A recommended · B pure YouTube look · C compact.
  import Masthead from "./Masthead.svelte";
  import Home from "./Home.svelte";
  import Watch from "./Watch.svelte";
  import Shorts from "./Shorts.svelte";
  import YtMenu from "./YtMenu.svelte";
  import Panel from "./Panel.svelte";
  import Switcher from "./Switcher.svelte";
  import { mock } from "./mock.svelte";

  let { gallery }: { gallery: (el: HTMLElement) => void } = $props();
  let galleryEl: HTMLElement | undefined = $state();
  $effect(() => {
    if (mock.page === "states" && galleryEl) gallery(galleryEl);
  });
</script>

<div class="app" data-pp-app>
  <Masthead />
  <ytd-page-manager class="page" class:fs={mock.fullscreen}>
    {#if mock.page === "home"}<Home />
    {:else if mock.page === "watch"}<Watch />
    {:else if mock.page === "shorts"}<Shorts />
    {:else}<div bind:this={galleryEl}></div>{/if}
  </ytd-page-manager>
  <YtMenu />
</div>
{#if mock.chrome}
  <Panel />
  <Switcher />
{/if}

<style>
  :global(html) {
    font-size: 62.5%;
  }
  :global(body) {
    margin: 0;
    background: var(--m-bg);
    color: var(--m-text);
    font-family: Roboto, Arial, sans-serif;
  }
  .page {
    display: block;
    padding: 56px 24px 24px 96px;
  }
  .page.fs {
    padding: 0;
  }
</style>
