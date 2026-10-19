// THROWAWAY PROTOTYPE (ticket 14). Dev hooks for the mock's panel and for scripts/live.mjs on real YouTube: a
// `pp-dev` CustomEvent (JSON string detail) reaches the isolated world from the page, sets fake state, and answers on
// `pp-dev-result`. Never in a product build.
import { view, log } from "./view.svelte";
import { add, notice } from "./flows";
import { showToast, toasts, recheck } from "../kit/toaster/toaster.svelte";

const g = globalThis as any;

function setPath(obj: any, path: string, value: unknown) {
  const keys = path.split(".");
  const last = keys.pop()!;
  for (const k of keys) obj = obj[k];
  obj[last] = value;
}

export function runDev(cmd: any): unknown {
  if (cmd.set) for (const [k, v] of Object.entries(cmd.set)) setPath(view, k, v);
  if (cmd.toast) showToast(cmd.toast);
  if (cmd.notice) notice(cmd.notice);
  if (cmd.hidden !== undefined) {
    toasts.simHidden = !!cmd.hidden;
    recheck();
  }
  if (cmd.escapeFix !== undefined) g.__pp.escapeFix = cmd.escapeFix;
  if (cmd.autoAddFire) {
    const v = cmd.autoAddFire === true ? view.watchVideo : cmd.autoAddFire;
    add(v, ["PLmusic"], "auto-add").then(() => (view.autoAdd.kind = "partly"));
  }
  if (cmd.restart) {
    const k = cmd.restart as keyof typeof view.features;
    view.features[k] = false;
    queueMicrotask(() => setTimeout(() => (view.features[k] = true), 0));
  }
  if (cmd.query) {
    const hosts = [...document.querySelectorAll("pp-layer, pp-overlay, pp-inline")].map((h) => ({
      tag: h.tagName.toLowerCase(),
      parent: h.parentElement?.tagName.toLowerCase() + (h.parentElement?.id ? "#" + h.parentElement.id : ""),
      rect: h.getBoundingClientRect().toJSON(),
    }));
    return { ...g.__pp.core.debug(), timing: g.__pp.timing, hosts, log: view.log.slice(0, 8), toast: toasts.current?.text ?? null };
  }
  return null;
}

export function installDevHooks() {
  document.addEventListener("pp-dev", (e) => {
    const cmd = JSON.parse((e as CustomEvent<string>).detail);
    let result: unknown;
    try {
      result = runDev(cmd);
    } catch (err) {
      result = { error: String(err) };
    }
    document.dispatchEvent(new CustomEvent("pp-dev-result", { detail: JSON.stringify(result ?? null) }));
  });
  log("dev hooks ready");
}
