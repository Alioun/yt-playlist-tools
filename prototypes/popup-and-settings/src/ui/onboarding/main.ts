// THROWAWAY PROTOTYPE (ticket 15). The onboarding page (ticket 17: its own page, not part of settings): first run,
// or the one-time 1.4.5 upgrade note, which doubles as the upgraders' consent (tickets 09, 19).
import "./onboarding.css";
import { mount } from "svelte";
import Onboarding from "./Onboarding.svelte";
import { createFakeBackend, fakePrompt } from "$ui/backend/fake";
import { applyTheme, start } from "$lib/view.svelte";
import { param } from "$lib/params";

const target = document.getElementById("app")!;
await start(createFakeBackend());
applyTheme(param("theme"));
mount(Onboarding, { target });

// Prototype chrome: the simulated browser permission prompt, loaded only when something asks.
fakePrompt.listeners.add(async () => {
  if (!fakePrompt.site || document.getElementById("fake-prompt")) return;
  const host = Object.assign(document.createElement("div"), { id: "fake-prompt" });
  document.body.append(host);
  await import("./onboarding-more.css");
  mount((await import("$ui/backend/fake/FakePrompt.svelte")).default, { target: host });
});
