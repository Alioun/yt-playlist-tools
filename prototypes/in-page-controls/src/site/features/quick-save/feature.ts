// THROWAWAY PROTOTYPE (ticket 14). Thumbnail quick-save: one slot in the kit's overlay, under the queue button.
// Shorts shelves get it when "On Shorts shelves too" is on (ticket 09). Made-for-kids cards can't be told apart from
// their markup, so the button is drawn and a click gets ticket 12's refusal (shown once per session).
import type { FeatureDef } from "../../feature";
import { view, flows, type Video } from "$kit";
import QuickSave from "./QuickSave.svelte";
import { qs } from "./ctx";

export const quickSave: FeatureDef = {
  id: "quick-save",
  needsKit: true,
  start(ctx) {
    qs.ctx = ctx;
    ctx.scope.add(() => (qs.ctx = null));
    if (view.health.quickSave === "broken") {
      ctx.scope.add(ctx.pointer.track());
      ctx.scope.add(ctx.pointer.subscribe((it) => it && it.kind !== "unsupported" && flows.notice(["quickSave"])));
      return;
    }
    flows.hooks.chooseQuickSave = (video: Video) =>
      ctx.popovers().then((p) => p.openPicker({ anchor: () => centreRect(), video, mode: "choose" }));
    ctx.scope.add(
      ctx.kit.overlay.register({
        id: "quick-save",
        order: 2,
        accepts: (it: { kind: string }) => it.kind === "video" || (it.kind === "short" && view.features.quickSaveOnShorts),
        component: QuickSave,
      }),
    );
  },
};

const centreRect = () => new DOMRect(innerWidth / 2, innerHeight / 3, 0, 0);
