<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). The harness: a full-window YouTube Music mock, the floating variant switcher
  // (?variant=A|B|C, ← and →), and a prototype panel with scenes, switches and the live state.
  import Shell from "./Shell.svelte";
  import Home from "./pages/Home.svelte";
  import Search from "./pages/Search.svelte";
  import Collection from "./pages/Collection.svelte";
  import Playing from "./pages/Playing.svelte";
  import States from "./pages/States.svelte";
  import PlayerBar from "./PlayerBar.svelte";
  import WizMiniplayer from "./WizMiniplayer.svelte";
  import Panel from "./Panel.svelte";
  import ToastLayer from "../kit/ToastLayer.svelte";
  import TooltipLayer from "../kit/TooltipLayer.svelte";
  import Picker from "../popovers/Picker.svelte";
  import { setFullscreenProbe, environmentChanged, show } from "../kit/toaster.svelte";
  import { copy } from "../kit/copy";
  import { ui, VARIANTS, picker, pointed, onKey, sim } from "./store.svelte";

  setFullscreenProbe(() => ui.fullscreen);

  // Keep the URL in step so a variant or scene is shareable and reload-stable.
  $effect(() => {
    const p = new URLSearchParams(location.search);
    p.set("variant", ui.variant);
    p.set("scene", ui.scene);
    history.replaceState(null, "", `?${p}`);
  });
  $effect(() => {
    void ui.fullscreen;
    environmentChanged();
  });

  // Ticket 18: the sticky notice, once per session, the moment the feature would draw its buttons.
  let noticeShown = false;
  function maybeNotice() {
    if (sim.notWorking && !noticeShown) {
      noticeShown = true;
      show({ kind: "notice", text: copy.notice(["Play next", "Add to queue"]), action: { label: "Details", run: () => true } });
    }
  }
  $effect(() => {
    if (!sim.notWorking) noticeShown = false;
  });

  function onPointerOver(e: PointerEvent) {
    const el = (e.target as HTMLElement).closest?.("[data-item]") as HTMLElement | null;
    const key = el?.dataset.item ?? "";
    if (key !== pointed.pointerKey || !pointed.pointerAt) {
      pointed.pointerKey = key;
      pointed.pointerAt = performance.now();
    }
    if (key) maybeNotice();
  }
  function onFocusIn(e: FocusEvent) {
    const t = e.target as HTMLElement;
    if (!t.matches?.(":focus-visible")) return;
    const el = t.closest?.("[data-item]") as HTMLElement | null;
    pointed.focusKey = el?.dataset.item ?? "";
    pointed.focusAt = performance.now();
  }
  function onKeydown(e: KeyboardEvent) {
    onKey(e);
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement;
    if (t?.closest?.("input, textarea, select, [contenteditable]")) return;
    if (!ui.chrome) return;
    const i = VARIANTS.findIndex((v) => v.id === ui.variant);
    if (e.key === "ArrowLeft") ui.variant = VARIANTS[(i + VARIANTS.length - 1) % VARIANTS.length].id;
    if (e.key === "ArrowRight") ui.variant = VARIANTS[(i + 1) % VARIANTS.length].id;
  }
  const cur = $derived(VARIANTS.find((v) => v.id === ui.variant)!);
  const showBar = $derived(ui.scene !== "states");
</script>

<svelte:window onkeydown={onKeydown} />
<svelte:document onpointerover={onPointerOver} onfocusin={onFocusIn} onpointerleave={() => ((pointed.pointerKey = ""), (pointed.pointerAt = performance.now()))} />

<Shell active={ui.scene === "home" ? "home" : ""}>
  {#if ui.scene === "home"}<Home />
  {:else if ui.scene === "search"}<Search />
  {:else if ui.scene === "album"}<Collection id="a1" />
  {:else if ui.scene === "playlist"}<Collection id="p1" />
  {:else if ui.scene === "states"}<States />{/if}
</Shell>
{#if ui.scene === "playing" || ui.fullscreen}<Playing />{/if}
{#if showBar}
  {#if ui.player === "wiz"}<WizMiniplayer />{:else}<PlayerBar />{/if}
{/if}

<ToastLayer bottom={showBar ? 84 : 24} />
<TooltipLayer />
{#if picker.model}
  <Picker bind:open={picker.open} model={picker.model} anchor={picker.anchor} centred={picker.centred} returnFocus={picker.returnFocus} />
{/if}

{#if ui.chrome}
  <div class="switcher" role="toolbar" aria-label="Prototype variant">
    <button onclick={() => (ui.variant = VARIANTS[(VARIANTS.findIndex((v) => v.id === ui.variant) + 2) % 3].id)} aria-label="Previous variant">‹</button>
    <span class="lbl"><b>{cur.id}</b> · {cur.name} <span class="hint">rows &amp; queue items</span></span>
    <button onclick={() => (ui.variant = VARIANTS[(VARIANTS.findIndex((v) => v.id === ui.variant) + 1) % 3].id)} aria-label="Next variant">›</button>
  </div>
  <Panel />
{/if}

<style>
  .switcher {
    position: fixed;
    left: 50%;
    bottom: 96px;
    transform: translateX(-50%);
    z-index: 3000;
    display: flex;
    align-items: center;
    gap: 6px;
    background: #ffd400;
    color: #111;
    border-radius: 999px;
    padding: 4px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
    font: 500 13px/1 system-ui, sans-serif;
  }
  .switcher button {
    all: unset;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #111;
    color: #ffd400;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    cursor: pointer;
  }
  .lbl {
    padding: 0 8px;
    white-space: nowrap;
  }
  .hint {
    opacity: 0.6;
    font-size: 11px;
    margin-left: 4px;
  }
</style>
