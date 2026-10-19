<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). The prototype's own panel. Deliberately not YouTube Music's look.
  import { ui, settings, sim, queue, SCENES, VARIANTS, picker } from "./store.svelte";
  import { toaster } from "../kit/toaster.svelte";
  import { SONGS } from "./data";
  import { ACTION_LABEL, ACTION_ORDER } from "../kit/model";

  let open = $state(ui.panel);
  const cur = $derived(VARIANTS.find((v) => v.id === ui.variant)!);
</script>

<div class="panel" class:closed={!open}>
  <button class="toggle" onclick={() => (open = !open)}>{open ? "Hide" : "Prototype"}</button>
  {#if open}
    <div class="body">
      <div class="title"><span class="tag">PROTOTYPE</span> Ticket 27 · YouTube Music controls</div>

      <div class="grp">Scene</div>
      <div class="seg">
        {#each SCENES as s}<button class:on={ui.scene === s.id} onclick={() => (ui.scene = s.id)}>{s.label}</button>{/each}
      </div>

      <div class="grp">Variant (rows and queue items) · ← →</div>
      <div class="seg">
        {#each VARIANTS as v}<button class:on={ui.variant === v.id} onclick={() => (ui.variant = v.id)}>{v.id}</button>{/each}
      </div>
      <p class="note">{cur.blurb}</p>

      <div class="grp">Player</div>
      <div class="seg">
        <button class:on={ui.player === "classic"} onclick={() => (ui.player = "classic")}>Classic bar</button>
        <button class:on={ui.player === "wiz"} onclick={() => (ui.player = "wiz")}>Wiz miniplayer (A/B)</button>
      </div>
      <label><input type="checkbox" bind:checked={ui.fullscreen} /> Fullscreen (f)</label>

      <div class="grp">Quick actions: buttons</div>
      {#each ACTION_ORDER as a}
        <label><input type="checkbox" bind:checked={settings.buttons[a]} /> {ACTION_LABEL[a]}</label>
      {/each}
      <label><input type="checkbox" bind:checked={settings.barSave} /> Save on the player bar</label>
      <label
        ><input
          type="checkbox"
          checked={!!settings.quickSave}
          onchange={(e) => (settings.quickSave = (e.target as HTMLInputElement).checked ? { id: "pl-fav", title: "Favourites" } : null)}
        /> Quick-save playlist set (off = choose mode)</label
      >
      <label><input type="checkbox" bind:checked={settings.keysOn} /> Quick-action shortcuts</label>

      <div class="grp">Situation</div>
      <label><input type="checkbox" bind:checked={settings.signedIn} /> Signed in (off: no Save, no Like)</label>
      <label><input type="checkbox" bind:checked={settings.casting} /> Casting (Chrome)</label>
      <label><input type="checkbox" bind:checked={sim.privateWindow} /> Private window (pins disabled)</label>
      <label><input type="checkbox" bind:checked={sim.failNext} /> Next action fails</label>
      <label><input type="checkbox" bind:checked={sim.slow} /> Slow answers (key Save shows "Saving…")</label>
      <label><input type="checkbox" bind:checked={sim.membershipUnknown} /> Membership can't be read</label>
      <label><input type="checkbox" bind:checked={sim.notWorking} /> YouTube Music changed: Play next and Add to queue not working</label>

      <div class="grp">Keys (point at an item, or the playing song)</div>
      <p class="note mono">Alt+N Play next · Alt+Q Add to queue · Alt+P Save · Alt+Shift+P picker · Alt+L Like · Alt+R Remove · Alt+U Undo</p>

      <div class="grp">State</div>
      <div class="state">
        <div><b>Picker:</b> {picker.open ? `open, ${picker.centred ? "centred" : "anchored"}, ${picker.model?.mode}` : "closed"}</div>
        <div><b>Quick-save:</b> {settings.quickSave?.title ?? "none (choose mode)"}</div>
        <div><b>Queue:</b></div>
        <ol>
          {#each queue.entries as e, i (e.qid)}<li class:cur={i === queue.current} class:auto={e.autoplay}>{SONGS[e.songId].title}{e.autoplay ? " (autoplay)" : ""}</li>{/each}
        </ol>
        <div><b>Toasts:</b></div>
        <ul>{#each toaster.log.slice(0, 8) as l}<li>{l}</li>{/each}</ul>
      </div>
    </div>
  {/if}
</div>

<style>
  .panel {
    position: fixed;
    top: 72px;
    right: 12px;
    z-index: 3000;
    width: 300px;
    max-height: calc(100vh - 190px);
    display: flex;
    flex-direction: column;
    background: #fffbe6;
    color: #222;
    border: 2px solid #ffd400;
    border-radius: 12px;
    font: 12px/1.4 system-ui, sans-serif;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
  }
  .panel.closed {
    width: auto;
    border-radius: 999px;
  }
  .toggle {
    all: unset;
    align-self: flex-end;
    background: #ffd400;
    padding: 4px 12px;
    border-radius: 999px;
    font-weight: 600;
    cursor: pointer;
    margin: 4px;
  }
  .body {
    overflow-y: auto;
    padding: 0 12px 12px;
  }
  .title {
    font-weight: 600;
    margin-bottom: 6px;
  }
  .tag {
    background: #222;
    color: #ffd400;
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 10px;
  }
  .grp {
    margin: 10px 0 4px;
    font-weight: 600;
    color: #6b5800;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.04em;
  }
  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .seg button {
    all: unset;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid #d9c46a;
    cursor: pointer;
  }
  .seg button.on {
    background: #222;
    color: #ffd400;
    border-color: #222;
  }
  label {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    margin: 2px 0;
  }
  .note {
    margin: 4px 0;
    color: #444;
  }
  .mono {
    font-family: ui-monospace, monospace;
    font-size: 11px;
  }
  .state ol,
  .state ul {
    margin: 2px 0 6px;
    padding-left: 18px;
  }
  .state li.cur {
    font-weight: 700;
  }
  .state li.auto {
    color: #888;
  }
</style>
