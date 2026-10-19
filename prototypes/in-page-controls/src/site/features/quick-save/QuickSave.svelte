<script lang="ts">
  // Thumbnail quick-save (tickets 12 and 26): a split button. One click saves to this account's quick-save playlist;
  // ▾ opens the playlist picker for a one-off save. With no quick-save playlist yet, the main part opens the picker in
  // choose mode and there's no ▾. After a save on this page the card shows a filled bookmark; pressing again answers
  // "already in" (ticket 12: one-click saves never toggle a video out).
  import { SplitButton, view, flows, titleOf } from "$kit";
  import type { Item } from "../../core/items-www";
  import { qs } from "./ctx";

  let { item }: { item: Item } = $props();
  let el: HTMLElement | undefined = $state();
  let open = $state(false);

  const target = $derived(view.quickSave);
  const id = $derived(item.videoId!);
  const saved = $derived(!!target && (view.membership[id] ?? []).includes(target));
  const st = $derived(view.saving[id] ?? "idle");
  const pickerKey = $derived(view.features.shortcuts ? " (Alt+Shift+P)" : "");
  const label = $derived(
    !target
      ? "Save to…"
      : st === "busy"
        ? `Saving to ${titleOf(target)}…`
        : st === "failed"
          ? "Couldn't save"
          : saved
            ? `Saved to ${titleOf(target)}`
            : `Save to ${titleOf(target)}`,
  );

  function openPicker(mode: "pick" | "choose") {
    if (flows.signedOutAnswer()) return;
    const anchor = el?.querySelector(".split") ?? el;
    if (!anchor || !qs.ctx) return;
    open = true;
    qs.ctx.kit.overlay.hold(true);
    const done = () => {
      open = false;
      qs.ctx?.kit.overlay.hold(false);
    };
    qs.ctx.popovers().then((p) => p.openPicker({ anchor, video: { id, title: item.title }, mode, onclose: done }), done);
  }

  async function save() {
    if (flows.signedOutAnswer()) return;
    if (!target) return openPicker("choose");
    if (st === "busy") return;
    view.saving[id] = "busy";
    const r = await flows.add({ id, title: item.title }, [target], "quick-save");
    view.saving[id] = r === "failed" ? "failed" : "done";
    setTimeout(() => (view.saving[id] = "idle"), 1500);
  }
</script>

<span bind:this={el} style="display:inline-flex">
  <SplitButton
    icon={saved && st === "idle" ? "bookmarkFilled" : "bookmark"}
    {label}
    tip={target ? label : `Save to…${pickerKey}`}
    state={st === "done" ? "done" : st === "failed" ? "failed" : st === "busy" ? "busy" : "idle"}
    more={!!target}
    moreLabel="Save to another playlist…"
    moreTip={`Save to…${pickerKey}`}
    expanded={open}
    onmain={save}
    onmore={() => (open ? qs.ctx?.popovers().then((p) => p.close()) : openPicker("pick"))}
    onmorehover={() => qs.ctx?.popovers({ quiet: true }).catch(() => {})}
  />
</span>
