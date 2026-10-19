<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). "Save on the player bar": Save to playlist for the playing song, immediately
  // left of YouTube Music's own like button, in the classic bar or the Wiz miniplayer (ticket 26).
  import SaveSplit from "../kit/SaveSplit.svelte";
  import { tipFor } from "../kit/model";
  import { settings, playingSong, act, openPicker, picker, stateOf, clusterSettings } from "./store.svelte";

  let { place }: { place: "bar" | "wiz" } = $props();
  const song = $derived(playingSong());
  const s = $derived(clusterSettings());
</script>

{#if song && settings.barSave && settings.signedIn}
  <span class="bs" data-cluster="bar">
    <SaveSplit
      {place}
      title={song.title}
      quickSave={settings.quickSave}
      status={stateOf("bar").save}
      open={picker.open && picker.songId === song.id}
      tipMain={tipFor("save", s)}
      tipMenu={tipFor("picker", s)}
      onsave={(el) => act("bar", "save", el)}
      onmenu={(el) => openPicker("bar", el, settings.quickSave ? "normal" : "choose")}
    />
  </span>
{/if}

<style>
  .bs {
    display: inline-flex;
    flex: none;
    margin-right: 8px;
  }
</style>
