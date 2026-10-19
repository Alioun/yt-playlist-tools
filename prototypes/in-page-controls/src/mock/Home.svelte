<script lang="ts">
  // YouTube's home: chips, the rich grid of lockups, and a Shorts shelf.
  import Card from "./Card.svelte";
  import ShortCard from "./ShortCard.svelte";
  import { videos, shorts } from "./data";
  import YIcon from "./YIcon.svelte";
  import { Y } from "./yt-icons";
</script>

<div class="chips">
  {#each ["All", "Music", "Cooking", "Science", "Live", "Woodworking", "Recently uploaded"] as c, i (c)}
    <span class="chip" class:on={i === 0}>{c}</span>
  {/each}
</div>
<ytd-rich-grid-renderer class="grid">
  {#each videos.slice(0, 8) as v (v.id)}<Card {v} />{/each}
</ytd-rich-grid-renderer>
<section class="shelf">
  <h2><span class="sicon"><YIcon d={Y.shorts} /></span>Shorts</h2>
  <div class="srow">
    {#each shorts as s (s.id)}<ShortCard {s} />{/each}
  </div>
</section>
<ytd-rich-grid-renderer class="grid">
  {#each videos.slice(8) as v (v.id)}<Card {v} />{/each}
</ytd-rich-grid-renderer>

<style>
  .chips {
    display: flex;
    gap: 12px;
    padding: 12px 0 24px;
  }
  .chip {
    height: 32px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    border-radius: 8px;
    background: var(--m-tonal);
    font: 500 1.4rem/2rem Roboto, Arial, sans-serif;
  }
  .chip.on {
    background: var(--m-inv);
    color: var(--m-inv-text);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 40px 16px;
  }
  .shelf {
    margin: 40px 0;
    padding-top: 24px;
    border-top: 1px solid var(--m-outline);
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 16px;
    font: 700 2rem/2.8rem Roboto, Arial, sans-serif;
  }
  .sicon {
    color: #f03;
  }
  .srow {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 16px;
  }
</style>
