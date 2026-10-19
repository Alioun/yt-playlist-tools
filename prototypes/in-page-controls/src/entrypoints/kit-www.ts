// THROWAWAY PROTOTYPE (ticket 14). Isolated world, after core-www.js and before every feature file. Installs the
// Svelte runtime the features link to (ticket 17's D4), then the kit.
// @ts-ignore virtual module from build/page-link.ts
import { client, index } from "virtual:pp-svelte-exports";
import { createKit } from "../site/kit/kit.svelte";
import { installDevHooks } from "../site/proto/dev";

const g = globalThis as any;
g.__pp.svelte = { client, index };
createKit(g.__pp.core);
installDevHooks();
