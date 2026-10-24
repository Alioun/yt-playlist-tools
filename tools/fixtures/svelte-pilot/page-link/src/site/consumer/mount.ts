import { mount } from "svelte"
import Consumer from "./Consumer.svelte"

export function install(label: string) {
  const target = document.createElement("section")
  target.dataset.consumer = label
  globalThis.__pp.kit.layer.append(target)
  mount(Consumer, { target })
  globalThis.__pp.core.trace.push(label)
}
