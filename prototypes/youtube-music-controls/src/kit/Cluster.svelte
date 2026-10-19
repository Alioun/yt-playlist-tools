<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). The quick-action buttons for one item, in YouTube Music's menu order.
  import ActionButton from "./ActionButton.svelte";
  import SaveSplit from "./SaveSplit.svelte";
  import { visibleActions, tipFor, type ActionId, type ButtonState, type ClusterSettings, type ItemView, type Place } from "./model";
  import type { IconName } from "./icons";

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
    place: Place;
    item: ItemView;
    settings: ClusterSettings;
    states?: Partial<Record<ActionId, ButtonState>>;
    pickerOpen?: boolean;
    onaction: (a: ActionId, el: HTMLElement) => void;
    onpicker: (el: HTMLElement) => void;
    onintent?: () => void;
  } = $props();

  const actions = $derived(visibleActions(place, item, settings));
  const ICON: Record<ActionId, IconName> = { playNext: "playNext", addToQueue: "addToQueue", save: "save", like: "like", remove: "removeFromQueue" };
  function name(a: ActionId) {
    const t = `"${item.title}"`;
    if (a === "like") return item.liked ? `Unlike ${t}` : `Like ${t}`;
    const verb = { playNext: "Play next", addToQueue: "Add to queue", save: "Save", like: "Like", remove: "Remove from queue" }[a];
    return `${verb}: ${t}`;
  }
</script>

{#if actions.length}
  <span class="cluster {place}" role="group" aria-label="Quick actions">
    {#each actions as a (a)}
      {#if a === "save"}
        <SaveSplit
          {place}
          title={item.title}
          quickSave={settings.quickSave}
          status={states.save}
          open={pickerOpen}
          tipMain={tipFor("save", settings, { title: item.nameInTip ? item.title : undefined })}
          tipMenu={tipFor("picker", settings)}
          onsave={(el) => onaction("save", el)}
          onmenu={onpicker}
          {onintent}
        />
      {:else}
        <ActionButton
          {place}
          icon={a === "like" && item.liked ? "liked" : ICON[a]}
          label={name(a)}
          tip={tipFor(a, settings, { liked: item.liked, title: item.nameInTip ? item.title : undefined })}
          status={states[a]}
          pressed={a === "like" ? !!item.liked : undefined}
          unavailable={settings.casting && (a === "playNext" || a === "addToQueue")}
          onclick={(el) => onaction(a, el)}
        />
      {/if}
    {/each}
  </span>
{/if}

<style>
  .cluster {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex: none;
  }
  .card {
    gap: 4px;
  }
  .header {
    gap: 12px;
  }
</style>
