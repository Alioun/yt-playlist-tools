<script lang="ts">
  // The thumbnail Add to queue button (tickets 12 and 29): Add to queue → Adding… → Added to queue (stays on that card
  // until the page changes; clicking it again does nothing) or Couldn't add (1.5 s), plus Sent, not confirmed (click
  // sends again). Each state has its own glyph and label.
  import { IconButton, view, flows } from "$kit";
  import type { Item } from "../../core/items-www";

  let { item }: { item: Item } = $props();
  const st = $derived(view.queued[item.videoId!] ?? "idle");
  const label = $derived(
    st === "busy"
      ? "Adding…"
      : st === "added"
        ? "Added to queue"
        : st === "unconfirmed"
          ? "Sent, not confirmed. Click to send again"
          : st === "failed"
            ? "Couldn't add"
            : "Add to queue",
  );
</script>

<IconButton
  icon="queue"
  {label}
  state={st === "added" ? "done" : st}
  onclick={() => {
    if (st === "added" || st === "busy") return;
    if (st === "unconfirmed") view.queued[item.videoId!] = "idle";
    flows.queueAdd({ id: item.videoId!, title: item.title });
  }}
/>
