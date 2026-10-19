// THROWAWAY PROTOTYPE (ticket 14). The Add to queue button: one slot in the kit's overlay, videos only (YouTube's own
// menu doesn't offer Add to queue on Shorts, and ticket 26's rule offers an action only where YouTube does).
import type { FeatureDef } from "../../feature";
import { view, flows } from "$kit";
import QueueButton from "./QueueButton.svelte";

export const queueButton: FeatureDef = {
  id: "queue-button",
  needsKit: true,
  start(ctx) {
    if (view.health.queue === "broken") {
      // Ticket 18: draw nothing; one notice, at the moment the buttons would have been drawn.
      ctx.scope.add(ctx.pointer.track());
      ctx.scope.add(ctx.pointer.subscribe((it) => it?.kind === "video" && flows.notice(["queue"])));
      return;
    }
    // Where YouTube draws its own hover Add to queue on the card (signed-out lockups, live 2026-10-19), ours steps
    // aside: one Add to queue per card. Elsewhere (other buckets, the playlist panel) ours fills the gap.
    const youtubeHasOwn = (el: Element) => !!el.querySelector("[aria-label='Add to queue']");
    ctx.scope.add(
      ctx.kit.overlay.register({
        id: "queue",
        order: 1,
        accepts: (it: { kind: string; el: Element }) => it.kind === "video" && !(view.queueDefers && youtubeHasOwn(it.el)),
        component: QueueButton,
      }),
    );
  },
};
