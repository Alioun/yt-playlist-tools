<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). YouTube Music's OWN row buttons (like, dislike, ⋮), drawn for context only.
  import Icon from "../kit/Icon.svelte";
  let { liked = false, like = true, size = 36 }: { liked?: boolean; like?: boolean; size?: number } = $props();
</script>

<span class="own">
  {#if like}
    <span class="b" style="width:{size}px;height:{size}px" title="Like (YouTube Music's)"><Icon name={liked ? "liked" : "like"} /></span>
    <span class="b" style="width:{size}px;height:{size}px" title="Dislike (YouTube Music's)"><Icon name="dislike" /></span>
    <span class="gap"></span>
  {/if}
  <span class="b" style="width:{size}px;height:{size}px" title="Action menu (YouTube Music's)"><Icon name="more" /></span>
</span>

<style>
  .own {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex: none;
  }
  .b {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: #fff;
  }
  .gap {
    width: 14px;
  }
</style>
