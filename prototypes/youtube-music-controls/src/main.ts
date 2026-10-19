// THROWAWAY PROTOTYPE (ticket 27, YouTube Music controls). Not production code.
// Three variants of how quick-action buttons sit in YouTube Music's rows, switchable with ?variant=A|B|C and the
// floating bar at the bottom; every other control (cards, headers, queue, Save, picker, player bar, Wiz miniplayer,
// toasts, the notice, keys) is drawn once, as decided.
import { mount } from "svelte";
import "./mock/app.css";
import App from "./mock/App.svelte";

mount(App, { target: document.getElementById("app")! });
