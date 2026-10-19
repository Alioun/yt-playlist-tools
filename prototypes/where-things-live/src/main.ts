// THROWAWAY PROTOTYPE (ticket 09, where things live). Not production code.
import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });
