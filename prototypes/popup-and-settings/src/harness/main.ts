// THROWAWAY PROTOTYPE (ticket 15). The harness (index.html): frames the real pages with a scenario, theme, OS,
// browser and popup variant. Prototype chrome, not product UI.
import "./harness.css";
import { mount } from "svelte";
import Harness from "./Harness.svelte";

mount(Harness, { target: document.getElementById("app")! });
