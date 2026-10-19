// THROWAWAY PROTOTYPE (ticket 15). The popup's entry: one Backend.load(), then the tab content for the site you're
// on, then the first frame. Everything else (the other site's tab, unfolded rows, This video's details, pickers,
// the account menu) is a dynamic import on first use.
//
// No top-level await: this module shares its chunk with the first view, so a lazy chunk imported while this module
// is still evaluating would wait on it forever (found with variants B and C, which rendered blank when built).
import "./popup.css";
import { mount } from "svelte";
import Popup from "./Popup.svelte";
import { createFakeBackend, fakePrompt } from "$ui/backend/fake";
import { applyTheme, start, ui } from "$lib/view.svelte";
import { param } from "$lib/params";

const target = document.getElementById("app")!;

start(createFakeBackend()).then(async () => {
  applyTheme(param("theme"));
  const variant = param("variant") ?? "A";
  if (variant === "B") mount((await import("./variants/DrillIn.svelte")).default, { target });
  else if (variant === "C") mount((await import("./variants/StatusFirst.svelte")).default, { target });
  else {
    // On YouTube Music its tab is needed for the first frame; elsewhere it loads only if you switch to it.
    const MusicTab = ui.s.env.activeSite === "music" ? (await import("./MusicTab.svelte")).default : null;
    mount(Popup, { target, props: { MusicTab } });
  }
  requestAnimationFrame(() => {
    (window as unknown as { __firstFrame: number }).__firstFrame = performance.now();
  });
});

// Prototype chrome: the simulated browser permission prompt, loaded only when something asks.
fakePrompt.listeners.add(async () => {
  if (!fakePrompt.site || document.getElementById("fake-prompt")) return;
  const host = Object.assign(document.createElement("div"), { id: "fake-prompt" });
  document.body.append(host);
  await import("./parts/parts.css");
  mount((await import("$ui/backend/fake/FakePrompt.svelte")).default, { target: host });
});
