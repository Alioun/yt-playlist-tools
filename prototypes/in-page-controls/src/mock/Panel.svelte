<script lang="ts">
  // Prototype chrome (deliberately not YouTube's look): every switch and simulated outcome, plus the live state.
  import { view, toasts, recheck, flows } from "$kit";
  import { mock } from "./mock.svelte";
  import { scenes } from "./scenes";
  import { applyTheme } from "./yt-theme";

  const g = globalThis as any;
  let debug = $state<any>(null);
  $effect(() => {
    const t = setInterval(() => (debug = g.__pp?.core?.debug?.()), 700);
    return () => clearInterval(t);
  });
  const hosts = $derived(debug ? document.querySelectorAll("pp-layer, pp-overlay, pp-inline").length : 0);

  function setParam(k: string, v: string) {
    const u = new URL(location.href);
    u.searchParams.set(k, v);
    location.href = u.toString();
  }
  function press(k: string, alt = true, shift = false) {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: shift ? k.toUpperCase() : k, code: `Key${k.toUpperCase()}`, altKey: alt, shiftKey: shift, bubbles: true, cancelable: true }));
  }
  const features: [keyof typeof view.features, string][] = [
    ["autoAdd", "Auto-add"],
    ["shortcuts", "Playlist shortcuts"],
    ["quickSave", "Quick-save on thumbnails"],
    ["quickSaveOnShorts", "… on Shorts shelves too"],
    ["queue", "Queue button on thumbnails"],
    ["watchButton", "Watch-page button"],
    ["watchButtonOnShorts", "… on Shorts too"],
    ["cardMenu", "Right-click for the video menu"],
  ];
  const healthKeys = ["quickSave", "queue", "watchButton", "cardMenu", "shortcuts", "autoAdd"] as const;
</script>

<aside class="panel" class:closed={!mock.panel}>
  <header>
    <span class="tag">PROTOTYPE</span><b>Ticket 14 · In-page controls</b>
    <button type="button" onclick={() => (mock.panel = !mock.panel)}>{mock.panel ? "Hide" : "Panel"}</button>
  </header>
  {#if mock.panel}
    <div class="body">
      <label>Scene
        <select value={mock.scene} onchange={(e) => setParam("scene", (e.currentTarget as HTMLSelectElement).value)}>
          {#each scenes as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
        </select>
      </label>
      <div class="row">
        <span>YouTube theme</span>
        <button type="button" class:on={mock.theme === "light"} onclick={() => setParam("theme", "light")}>Light</button>
        <button type="button" class:on={mock.theme === "dark"} onclick={() => setParam("theme", "dark")}>Dark</button>
      </div>
      <div class="row">
        <span>Variant</span>
        {#each ["A", "B", "C"] as l (l)}
          <button type="button" class:on={view.look === l} onclick={() => setParam("variant", l)}>{l}</button>
        {/each}
      </div>
      <p class="hint">A: recommended. B: pure YouTube look (no mark, labelled "Save to…" when idle). C: compact (icon-only pill, buttons in a row).</p>
      <label class="chk"><input type="checkbox" checked={!mock.varsPresent} onchange={(e) => { mock.varsPresent = !(e.currentTarget as HTMLInputElement).checked; applyTheme(mock.theme, mock.varsPresent); }} />YouTube's theme variables missing (fallback palette)</label>
      <label class="chk"><input type="checkbox" bind:checked={mock.ytToggles} />YouTube draws its own hover toggles</label>

      <h4>Features (on = drawn)</h4>
      {#each features as [k, label] (k)}
        <label class="chk"><input type="checkbox" bind:checked={view.features[k]} />{label}</label>
      {/each}
      <h4>Not working (ticket 18)</h4>
      <div class="wrap">
        {#each healthKeys as k (k)}
          <label class="chk small"><input type="checkbox" checked={view.health[k] === "broken"} onchange={(e) => { view.health[k] = (e.currentTarget as HTMLInputElement).checked ? "broken" : "working"; const f = k as keyof typeof view.features; view.features[f] = false; setTimeout(() => (view.features[f] = true), 30); }} />{k}</label>
        {/each}
      </div>

      <h4>Account and outcomes (fake)</h4>
      <label class="chk"><input type="checkbox" bind:checked={view.signedIn} />Signed in</label>
      <label>Quick-save playlist
        <select bind:value={view.quickSave}>
          <option value={null}>None yet (choose mode)</option>
          {#each view.playlists as p (p.id)}<option value={p.id}>{p.title}</option>{/each}
        </select>
      </label>
      <label>Auto-add state (ticket 07)
        <select bind:value={view.autoAdd.kind}>
          {#each ["counting", "partly", "added", "already", "failed", "skipped", "paused", "live", "cantMeasure", "notTracked"] as k (k)}<option value={k}>{k}</option>{/each}
        </select>
      </label>
      <label>Watched {view.autoAdd.progress} %<input type="range" min="0" max="100" bind:value={view.autoAdd.progress} /></label>
      <label>Saves answer
        <select bind:value={view.outcome.save}>
          {#each ["ok", "already", "fail", "missing", "refused"] as k (k)}<option value={k}>{k}</option>{/each}
        </select>
      </label>
      <label>Queue answers
        <select bind:value={view.outcome.queue}>
          {#each ["confirmed", "unconfirmed", "fail"] as k (k)}<option value={k}>{k}</option>{/each}
        </select>
      </label>
      <label>Answer after {view.outcome.latency} ms<input type="range" min="100" max="5000" step="100" bind:value={view.outcome.latency} /></label>
      <label class="chk"><input type="checkbox" bind:checked={view.outcome.membershipOk} />Membership readable (picker check marks)</label>
      <label class="chk"><input type="checkbox" bind:checked={view.feedback.queue} />Queue toast (Show feedback)</label>
      <label class="chk"><input type="checkbox" bind:checked={view.queueDefers} />Our queue steps aside for YouTube's own</label>
      <label class="chk"><input type="checkbox" bind:checked={view.linksKeepBrowserMenu} />Links inside cards keep the browser's menu</label>

      <h4>Simulate</h4>
      <div class="wrap">
        <button type="button" onclick={() => press("w")}>Alt+W</button>
        <button type="button" onclick={() => press("p", true, true)}>Alt+Shift+P</button>
        <button type="button" onclick={() => press("u")}>Alt+U</button>
        <button type="button" onclick={() => flows.add(view.watchVideo, ["PLmusic"], "auto-add")}>Auto-add fires</button>
        <button type="button" onclick={() => { toasts.simHidden = !toasts.simHidden; recheck(); }}>{toasts.simHidden ? "Show tab" : "Hide tab"}</button>
      </div>
      <p class="hint">Keys act on the card under the pointer, else the current video. Right-click a card; Shift+right-click for the browser's menu.</p>

      <h4>State</h4>
      <pre>{JSON.stringify(
          {
            running: debug?.running,
            shadowHosts: hosts,
            settleCheck: debug?.settle,
            toast: toasts.current?.text ?? null,
            held: toasts.held?.text ?? null,
            openLayer: view.openLayer,
            log: view.log.slice(0, 6),
          },
          null,
          1,
        )}</pre>
    </div>
  {/if}
</aside>

<style>
  .panel {
    position: fixed;
    top: 64px;
    right: 8px;
    width: 300px;
    max-height: calc(100vh - 140px);
    overflow: auto;
    z-index: 2400;
    border-radius: 10px;
    background: #1e2430;
    color: #e6e9ef;
    font: 12px/1.4 system-ui, sans-serif;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
  }
  .panel.closed {
    width: auto;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    position: sticky;
    top: 0;
    background: #1e2430;
  }
  header b {
    flex: 1;
    font-weight: 600;
  }
  .tag {
    background: #ffd54a;
    color: #222;
    font-weight: 700;
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 4px;
  }
  .body {
    padding: 0 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  h4 {
    margin: 10px 0 2px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #9aa4b8;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  label.chk {
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  .small {
    font-size: 11px;
  }
  .row,
  .wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .row span {
    flex: 1;
  }
  button,
  select {
    font: inherit;
    color: #e6e9ef;
    background: #2c3445;
    border: 1px solid #3c4559;
    border-radius: 6px;
    padding: 3px 7px;
  }
  button.on {
    background: #ffd54a;
    color: #222;
  }
  .hint {
    margin: 0;
    color: #9aa4b8;
    font-size: 11px;
  }
  pre {
    margin: 0;
    white-space: pre-wrap;
    font-size: 10.5px;
    background: #141821;
    padding: 6px;
    border-radius: 6px;
  }
</style>
