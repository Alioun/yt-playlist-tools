<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). Search results: wide song rows and an albums shelf.
  import SongRow from "../SongRow.svelte";
  import Card from "../Card.svelte";

  let width = $state(innerWidth);
  const inner = $derived(Math.min(width - 240 - 212, 860));
  const CHIPS = ["Songs", "Videos", "Albums", "Artists", "Community playlists", "Episodes", "Profiles", "Featured playlists"];
</script>

<svelte:window bind:innerWidth={width} />

<div class="page" style="width:{inner}px">
  <div class="chips">{#each CHIPS as c}<span class="chip">{c}</span>{/each}</div>
  <h3>Songs</h3>
  <div class="list">
    {#each ["s1", "s6", "s5", "s15", "s21"] as id}<SongRow songId={id} ctx="search" layout="search" />{/each}
  </div>
  <h3>Albums</h3>
  <div class="shelf">{#each ["a1", "a3", "a6", "a2"] as id}<Card {id} width={180} />{/each}</div>
</div>

<style>
  .page {
    margin: 0 auto;
    padding-bottom: 48px;
  }
  .chips {
    display: flex;
    gap: 12px;
    padding: 6px 0 24px;
    overflow: hidden;
  }
  .chip {
    flex: none;
    height: 32px;
    padding: 0 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    display: inline-flex;
    align-items: center;
    font: 500 14px Roboto, sans-serif;
  }
  h3 {
    font: 700 24px/1.3 "YouTube Sans", Roboto, sans-serif;
    margin: 8px 0 12px;
  }
  .list {
    margin-bottom: 28px;
  }
  .shelf {
    display: flex;
    gap: 24px;
  }
</style>
