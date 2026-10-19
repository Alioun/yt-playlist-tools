<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). Every control state and every toast, side by side, in YouTube Music's look.
  import ActionButton from "../../kit/ActionButton.svelte";
  import SaveSplit from "../../kit/SaveSplit.svelte";
  import ToastView from "../../kit/ToastView.svelte";
  import { copy } from "../../kit/copy";

  const T = "Midnight Overpass";
  const noop = () => {};
  const row: { label: string; state?: "idle" | "busy" | "done" | "failed" | "unconfirmed"; unavailable?: boolean; hover?: boolean }[] = [
    { label: "Idle" },
    { label: "Hover", hover: true },
    { label: "Busy", state: "busy" },
    { label: "Done (1.5 s)", state: "done" },
    { label: "Failed (1.5 s)", state: "failed" },
    { label: "Casting", unavailable: true },
  ];
  const toasts: { kind: "confirm" | "neutral" | "failure" | "pending" | "notice"; text: string; action?: string; busy?: boolean }[] = [
    { kind: "confirm", text: copy.playNext(T), action: "Undo" },
    { kind: "confirm", text: copy.playNext("Afterglow Avenue", { count: 4 }), action: "Undo" },
    { kind: "confirm", text: copy.addToQueue(T), action: "Undo" },
    { kind: "confirm", text: copy.movedNext("Kintsugi"), action: "Undo" },
    { kind: "confirm", text: copy.movedEnd("Kintsugi"), action: "Undo" },
    { kind: "confirm", text: copy.removed("Kintsugi"), action: "Undo" },
    { kind: "confirm", text: copy.saved(T, "Favourites"), action: "Undo" },
    { kind: "confirm", text: copy.savedFirst(T, "Late-night jazz"), action: "Undo" },
    { kind: "confirm", text: copy.saved(T, "Favourites"), action: "Undo", busy: true },
    { kind: "confirm", text: copy.liked(T), action: "Undo" },
    { kind: "confirm", text: copy.playing(T) },
    { kind: "pending", text: copy.saving(T, "Favourites") },
    { kind: "neutral", text: copy.alreadyIn(T, "Favourites") },
    { kind: "neutral", text: copy.pointAtQueue },
    { kind: "neutral", text: copy.casting },
    { kind: "failure", text: copy.failQueue(T) },
    { kind: "failure", text: copy.deleted("Favourites"), action: "Choose" },
    { kind: "failure", text: "Couldn't undo." },
    { kind: "notice", text: copy.notice(["Play next", "Add to queue"]), action: "Details" },
  ];
</script>

<div class="sheet">
  <h2>Button states</h2>
  <div class="grid">
    <div class="cap"></div>
    {#each row as r}<div class="cap">{r.label}</div>{/each}

    <div class="cap l">Row / queue (36 px)</div>
    {#each row as r}
      <div class="cell" class:fakehover={r.hover}><ActionButton place="row" icon="playNext" label="Play next" tip="Play next (Alt+N)" status={r.state} unavailable={r.unavailable} /></div>
    {/each}

    <div class="cap l">Card (32 px on the art)</div>
    {#each row as r}
      <div class="cell art" class:fakehover={r.hover}><ActionButton place="card" icon="addToQueue" label="Add to queue" tip="Add to queue (Alt+Q)" status={r.state} unavailable={r.unavailable} /></div>
    {/each}

    <div class="cap l">Album / playlist header (40 px)</div>
    {#each row as r}
      <div class="cell" class:fakehover={r.hover}><ActionButton place="header" icon="playNext" label="Play next" tip="Play next (Alt+N)" status={r.state} unavailable={r.unavailable} /></div>
    {/each}

    <div class="cap l">Save, one click + ▾</div>
    {#each row.slice(0, 5) as r}
      <div class="cell" class:fakehover={r.hover}><SaveSplit place="row" title={T} quickSave={{ title: "Favourites" }} status={r.state} tipMain="Save to Favourites (Alt+P)" tipMenu="Save to playlist… (Alt+Shift+P)" onsave={noop} onmenu={noop} /></div>
    {/each}
    <div class="cell"><SaveSplit place="row" title={T} quickSave={{ title: "Favourites" }} open tipMain="" tipMenu="" onsave={noop} onmenu={noop} /><span class="small">picker open</span></div>

    <div class="cap l">Save, choose mode</div>
    <div class="cell"><SaveSplit place="row" title={T} quickSave={null} tipMain="Save to playlist… (Alt+P)" tipMenu="" onsave={noop} onmenu={noop} /></div>
    <div class="cell fakehover"><SaveSplit place="row" title={T} quickSave={null} tipMain="" tipMenu="" onsave={noop} onmenu={noop} /></div>
    <div class="cap"></div><div class="cap"></div><div class="cap"></div><div class="cap"></div>

    <div class="cap l">Wiz miniplayer Save</div>
    <div class="cell bar"><SaveSplit place="wiz" title={T} quickSave={{ title: "Favourites" }} tipMain="" tipMenu="" onsave={noop} onmenu={noop} /></div>
    <div class="cell bar"><SaveSplit place="wiz" title={T} quickSave={null} tipMain="" tipMenu="" onsave={noop} onmenu={noop} /></div>
    <div class="cell bar"><SaveSplit place="wiz" title={T} quickSave={{ title: "Favourites" }} status="busy" tipMain="" tipMenu="" onsave={noop} onmenu={noop} /></div>
    <div class="cell bar"><SaveSplit place="wiz" title={T} quickSave={{ title: "Favourites" }} status="done" tipMain="" tipMenu="" onsave={noop} onmenu={noop} /></div>
    <div class="cap"></div><div class="cap"></div>

    <div class="cap l">Like (queue items only)</div>
    <div class="cell"><ActionButton place="queue" icon="like" label="Like" tip="Like (Alt+L)" /></div>
    <div class="cell"><ActionButton place="queue" icon="liked" label="Unlike" tip="Unlike (Alt+L)" pressed /></div>
    <div class="cell"><ActionButton place="queue" icon="like" label="Like" tip="" status="busy" /></div>
    <div class="cap l">Remove from queue</div>
    <div class="cell"><ActionButton place="queue" icon="removeFromQueue" label="Remove" tip="Remove from queue (Alt+R)" /></div>
    <div class="cell"><ActionButton place="queue" icon="removeFromQueue" label="Remove" tip="" status="busy" /></div>
  </div>

  <h2>Toasts</h2>
  <div class="toasts">
    {#each toasts as t}
      <div><ToastView kind={t.kind} text={t.text} actionLabel={t.action} busy={t.busy} animate={false} /></div>
    {/each}
  </div>
</div>

<style>
  .sheet {
    padding: 24px 48px 80px;
  }
  h2 {
    font: 700 24px "YouTube Sans", Roboto, sans-serif;
    margin: 8px 0 16px;
  }
  .grid {
    display: grid;
    grid-template-columns: 200px repeat(6, 128px);
    gap: 10px 8px;
    align-items: center;
    margin-bottom: 32px;
  }
  .cap {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }
  .cap.l {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.85);
  }
  .cell {
    height: 52px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 8px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
  }
  .cell.art {
    background: linear-gradient(135deg, #c94b4b, #4b134f);
  }
  .cell.bar {
    background: #212121;
  }
  .cell.fakehover :global(.ab),
  .cell.fakehover :global(.split) {
    background: rgba(255, 255, 255, 0.1);
  }
  .cell.art.fakehover :global(.ab) {
    background: rgba(0, 0, 0, 0.85);
  }
  .small {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
  }
  .toasts {
    display: grid;
    grid-template-columns: repeat(2, max-content);
    justify-items: start;
    gap: 14px 24px;
  }
</style>
