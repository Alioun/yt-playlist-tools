<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). YouTube Music's Home: chips, Quick picks (compact rows in a carousel: 313 px
  // wide at a 1440 px window, the narrowest case measured), and card shelves.
  import Icon from "../../kit/Icon.svelte";
  import SongRow from "../SongRow.svelte";
  import Card from "../Card.svelte";
  import { QUICK_PICKS } from "../data";

  let width = $state(innerWidth);
  const inner = $derived(width - 240 - 212);
  const cols = $derived(inner < 900 ? 2 : 3);
  const rowW = $derived(Math.floor((inner - (cols - 1) * 24) / cols));
  const perShelf = $derived(inner < 900 ? 5 : 6);
  const cardW = $derived(Math.floor((inner - (perShelf - 1) * 24) / perShelf));
  const CHIPS = ["Podcasts", "Energize", "Feel good", "Relax", "Workout", "Commute", "Party", "Focus", "Romance", "Sad", "Sleep"];
</script>

<svelte:window bind:innerWidth={width} />

<div class="page" style="padding: 0 106px">
  <div class="chips">{#each CHIPS as c}<span class="chip">{c}</span>{/each}</div>

  <section>
    <div class="shead">
      <div><div class="strap">Alioun</div><h2>Quick picks</h2></div>
      <div class="nav"><span class="playall">Play all</span><span class="arr dim"><Icon name="chevronLeft" /></span><span class="arr"><Icon name="chevronRight" /></span></div>
    </div>
    <div class="grid" style="grid-template-columns: repeat({cols}, {rowW}px)">
      {#each Array.from({ length: cols }) as _, c}
        <div class="col">
          {#each QUICK_PICKS.slice(c * 4, c * 4 + 4) as id}
            <SongRow songId={id} ctx="qp" layout="compact" />
          {/each}
        </div>
      {/each}
    </div>
  </section>

  <section>
    <div class="shead">
      <div><div class="strap">From artists you listen to</div><h2>Albums for you</h2></div>
      <div class="nav"><span class="arr dim"><Icon name="chevronLeft" /></span><span class="arr"><Icon name="chevronRight" /></span></div>
    </div>
    <div class="shelf">{#each ["a1", "a2", "a3", "a4", "a5", "a6"].slice(0, perShelf) as id}<Card {id} width={cardW} />{/each}</div>
  </section>

  <section>
    <div class="shead">
      <div><h2>Mixed for you</h2></div>
    </div>
    <div class="shelf">{#each ["p1", "p3", "p4", "p2", "a5", "a6"].slice(0, perShelf) as id}<Card {id} width={cardW} />{/each}</div>
  </section>
</div>

<style>
  .page {
    padding-bottom: 48px;
  }
  .chips {
    display: flex;
    gap: 12px;
    padding: 30px 0 34px;
    overflow: hidden;
  }
  .chip {
    flex: none;
    height: 36px;
    padding: 0 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    display: inline-flex;
    align-items: center;
    font: 500 14px Roboto, sans-serif;
  }
  section {
    margin-bottom: 40px;
  }
  .shead {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .strap {
    color: rgba(255, 255, 255, 0.7);
    font-size: 16px;
    text-transform: uppercase;
    margin-bottom: 2px;
  }
  h2 {
    margin: 0;
    font: 700 34px/1.2 "YouTube Sans", Roboto, sans-serif;
  }
  .nav {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .playall {
    height: 38px;
    padding: 0 16px;
    border-radius: 19px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    display: inline-flex;
    align-items: center;
    font: 500 14px Roboto, sans-serif;
  }
  .arr {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.2);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .arr.dim {
    opacity: 0.4;
  }
  .grid {
    display: grid;
    gap: 0 24px;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .shelf {
    display: flex;
    gap: 24px;
  }
</style>
