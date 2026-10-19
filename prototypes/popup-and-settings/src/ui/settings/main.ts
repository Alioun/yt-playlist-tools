// THROWAWAY PROTOTYPE (ticket 15). The settings page's entry: one Backend.load(), then the shell and the YouTube
// section paint. Every other section, Diagnostics included, is a dynamic import (ticket 24).
import "./settings.css";
import { mount } from "svelte";
import Settings from "./Settings.svelte";
import { createFakeBackend, fakePrompt } from "$ui/backend/fake";
import { applyTheme, start } from "$lib/view.svelte";
import { param } from "$lib/params";

const target = document.getElementById("app")!;
await start(createFakeBackend());
applyTheme(param("theme"));
mount(Settings, { target });

requestAnimationFrame(() => {
  (window as unknown as { __firstFrame: number }).__firstFrame = performance.now();
});

// Prototype chrome: the simulated browser permission prompt, loaded only when something asks.
fakePrompt.listeners.add(async () => {
  if (!fakePrompt.site || document.getElementById("fake-prompt")) return;
  const host = Object.assign(document.createElement("div"), { id: "fake-prompt" });
  document.body.append(host);
  mount((await import("$ui/backend/fake/FakePrompt.svelte")).default, { target: host });
});
