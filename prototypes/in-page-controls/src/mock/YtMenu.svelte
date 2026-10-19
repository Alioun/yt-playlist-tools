<script lang="ts">
  // YouTube's own ⋮ dropdown for a card (live, signed out: Add to queue, Save to playlist, Download, Share; 40 px items,
  // 12 px radius, opening at the ⋮ button). It's YouTube's UI: our right-click feature only opens it.
  import YIcon from "./YIcon.svelte";
  import { Y } from "./yt-icons";
  import { mock } from "./mock.svelte";
  import { view } from "$kit";

  const items = $derived(
    view.signedIn
      ? [
          [Y.queue, "Add to queue"],
          [Y.clock, "Save to Watch later"],
          [Y.bookmark, "Save to playlist"],
          [Y.download, "Download"],
          [Y.share, "Share"],
          [Y.flag, "Not interested"],
        ]
      : [
          [Y.queue, "Add to queue"],
          [Y.bookmark, "Save to playlist"],
          [Y.download, "Download"],
          [Y.share, "Share"],
        ],
  );
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && (mock.menu = null)} />
{#if mock.menu}
  <button type="button" class="scrim" aria-label="Close menu" onclick={() => (mock.menu = null)}></button>
  <tp-yt-iron-dropdown class="dd" style:left="{mock.menu.x}px" style:top="{mock.menu.y}px" role="menu">
    {#each items as [d, label] (label)}
      <button type="button" class="it" role="menuitem" onclick={() => (mock.menu = null)}><YIcon {d} />{label}</button>
    {/each}
  </tp-yt-iron-dropdown>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 2201;
    border: 0;
    background: transparent;
  }
  .dd {
    position: fixed;
    z-index: 2202;
    display: block;
    min-width: 160px;
    padding: 8px 0;
    border-radius: 12px;
    background: var(--m-menu);
    box-shadow: 0 4px 32px 0 rgba(0, 0, 0, 0.1);
  }
  .it {
    width: 100%;
    height: 40px;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 16px 0 12px;
    border: 0;
    background: transparent;
    color: var(--m-text);
    font: 400 1.4rem/2rem Roboto, Arial, sans-serif;
    white-space: nowrap;
    cursor: pointer;
  }
  .it:hover {
    background: var(--m-tonal);
  }
</style>
