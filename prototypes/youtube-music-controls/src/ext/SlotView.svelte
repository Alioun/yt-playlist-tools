<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27, rough dev build). What one of our hosts draws: a cluster for an item, or the
  // player bar's Save.
  import Cluster from "../kit/Cluster.svelte";
  import SaveSplit from "../kit/SaveSplit.svelte";
  import { tipFor, type ActionId, type ButtonState, type ClusterSettings, type ItemView, type Place } from "../kit/model";

  let {
    place,
    item,
    settings,
    states = {},
    pickerOpen = false,
    onaction,
    onpicker,
    onintent,
  }: {
    place: Place | null;
    item: ItemView | null;
    settings: ClusterSettings;
    states?: Partial<Record<ActionId, ButtonState>>;
    pickerOpen?: boolean;
    onaction: (a: ActionId, el: HTMLElement) => void;
    onpicker: (el: HTMLElement) => void;
    onintent?: () => void;
  } = $props();
</script>

{#if place && item}
  {#if place === "bar" || place === "wiz"}
    <SaveSplit
      {place}
      title={item.title}
      quickSave={settings.quickSave}
      status={states.save}
      open={pickerOpen}
      tipMain={tipFor("save", settings)}
      tipMenu={tipFor("picker", settings)}
      onsave={(el) => onaction("save", el)}
      onmenu={onpicker}
      {onintent}
    />
  {:else}
    <Cluster {place} {item} {settings} {states} {pickerOpen} {onaction} {onpicker} {onintent} />
  {/if}
{/if}
