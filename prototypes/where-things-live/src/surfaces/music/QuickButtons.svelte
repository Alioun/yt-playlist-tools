<script lang="ts">
  // Our quick-action cluster for one item. Which actions an item gets follows ticket 26:
  // rows: Play next, Add to queue, Save, Like (no Like where YouTube Music shows its own);
  // cards and headers: Play next, Add to queue; queue items: Save, Like, Remove from queue.
  // Order is always Play next, Add to queue, Save, Like, Remove.
  import ListStart from "@lucide/svelte/icons/list-start";
  import ListEnd from "@lucide/svelte/icons/list-end";
  import ThumbsUp from "@lucide/svelte/icons/thumbs-up";
  import ListX from "@lucide/svelte/icons/list-x";
  import { app } from "$lib/state.svelte";
  import { cn } from "$lib/utils";
  import ActionIcon from "./ActionIcon.svelte";
  import SaveSplit from "./SaveSplit.svelte";
  import { buttonOn } from "./store.svelte";
  import { playNext, addToQueue, like, removeFromQueue, type Item } from "./actions";

  let {
    item,
    context,
    queueIndex = -1,
    allowLike = true,
    class: className = "",
  }: {
    item: Item;
    context: "row" | "card" | "header" | "queue";
    queueIndex?: number;
    allowLike?: boolean;
    class?: string;
  } = $props();

  const id = $derived(item.kind === "song" ? item.song.id : item.album.id);
  const k = (a: string) => `${context}-${id}-${queueIndex}-${a}`;
  const keys = $derived(app.features.musicShortcuts.on ? app.features.musicShortcuts.keys : null);
  const tip = (name: string, key?: string) => (key ? `${name} (${key})` : name);
  const variant = $derived(context === "card" ? "card" : context === "header" ? "header" : "row");
  const casting = $derived(app.env.casting);

  const showQueueAdds = $derived(context !== "queue");
  const song = $derived(item.kind === "song" ? item.song : null);
  const showSave = $derived(!!song && buttonOn("save") && (context === "row" || context === "queue"));
  const showLike = $derived(!!song && allowLike && buttonOn("like") && (context === "row" || context === "queue"));
  const showRemove = $derived(context === "queue" && buttonOn("remove"));
  const showNext = $derived(showQueueAdds && buttonOn("playNext"));
  const showAdd = $derived(showQueueAdds && buttonOn("addToQueue"));
  const any = $derived(showNext || showAdd || showSave || showLike || showRemove);
  const castTip = "Not available while casting";
</script>

{#if any}
  <span class={cn("ext-mark inline-flex items-center gap-1 rounded-full", className)}>
    {#if showNext}
      <ActionIcon
        icon={ListStart}
        {variant}
        label={casting ? castTip : tip("Play next", keys?.playNext)}
        dimmed={casting}
        busyKey={k("next")}
        onclick={() => playNext(item, "click", k("next"))}
      />
    {/if}
    {#if showAdd}
      <ActionIcon
        icon={ListEnd}
        {variant}
        label={casting ? castTip : tip("Add to queue", keys?.addToQueue)}
        dimmed={casting}
        busyKey={k("add")}
        onclick={() => addToQueue(item, "click", k("add"))}
      />
    {/if}
    {#if showSave && song}
      <SaveSplit {song} busyKey={k("save")} />
    {/if}
    {#if showLike && song}
      <ActionIcon
        icon={ThumbsUp}
        {variant}
        label={tip(app.music.liked.includes(song.id) ? "Unlike" : "Like", keys?.like)}
        filled={app.music.liked.includes(song.id)}
        busyKey={k("like")}
        onclick={() => like(song, "click")}
      />
    {/if}
    {#if showRemove}
      <ActionIcon
        icon={ListX}
        {variant}
        label={tip("Remove from queue", keys?.remove)}
        busyKey={k("remove")}
        onclick={() => removeFromQueue(queueIndex, "click")}
      />
    {/if}
  </span>
{/if}
