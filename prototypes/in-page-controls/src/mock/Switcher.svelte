<script lang="ts">
  // The floating bottom bar (prototype skill): ← / → cycle the scenes, reload-stable through ?scene=. The arrow keys
  // do too, unless a text field has focus. Plus the YouTube theme and the variant.
  import { mock } from "./mock.svelte";
  import { scenes } from "./scenes";
  import { view } from "$kit";

  const i = $derived(Math.max(0, scenes.findIndex((s) => s.id === mock.scene)));
  function set(k: string, v: string) {
    const u = new URL(location.href);
    u.searchParams.set(k, v);
    location.href = u.toString();
  }
  const step = (d: number) => set("scene", scenes[(i + d + scenes.length) % scenes.length].id);
  function onkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (e.altKey || e.ctrlKey || e.metaKey || t.matches?.("input, textarea, select, [contenteditable]")) return;
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  }
</script>

<svelte:window {onkeydown} />
<div class="bar">
  <button type="button" aria-label="Previous scene" onclick={() => step(-1)}>‹</button>
  <span class="label"><b>{i + 1}/{scenes.length}</b> {scenes[i].label}</span>
  <button type="button" aria-label="Next scene" onclick={() => step(1)}>›</button>
  <span class="sep"></span>
  <button type="button" class="mini" onclick={() => set("theme", mock.theme === "dark" ? "light" : "dark")}>{mock.theme === "dark" ? "Dark" : "Light"}</button>
  <button type="button" class="mini" onclick={() => set("variant", view.look === "A" ? "B" : view.look === "B" ? "C" : "A")}>Variant {view.look}</button>
</div>

<style>
  .bar {
    position: fixed;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    z-index: 2400;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 999px;
    background: #1e2430;
    color: #e6e9ef;
    font: 13px/1.2 system-ui, sans-serif;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  }
  .label {
    min-width: 280px;
    text-align: center;
  }
  .label b {
    color: #9aa4b8;
    font-weight: 500;
    margin-right: 4px;
  }
  button {
    border: 0;
    background: #2c3445;
    color: #e6e9ef;
    border-radius: 999px;
    width: 30px;
    height: 30px;
    font-size: 18px;
    cursor: pointer;
  }
  .mini {
    width: auto;
    height: 26px;
    padding: 0 10px;
    font-size: 12px;
  }
  .sep {
    width: 1px;
    height: 20px;
    background: #3c4559;
  }
</style>
