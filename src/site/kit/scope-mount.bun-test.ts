import { expect, test } from "bun:test"
import { flushSync } from "svelte"
import Owned from "../../../tools/fixtures/site-core-lifecycle/Owned.svelte"
import { Scope } from "../core/scope"
import { svelteScopeMount } from "./scope-mount"

test("real Svelte mount removes DOM and runs teardown immediately without an outro", async () => {
  const target = document.createElement("div")
  document.body.append(target)
  const errors: unknown[] = []
  let destroyed = 0
  const onError = (error: unknown) => { errors.push(error) }
  const owner = new Scope({ document, mount: svelteScopeMount(onError), onError })
  try {
    const release = owner.mount(Owned, { label: "Owned component", destroyed: () => { destroyed++ } }, target)
    flushSync()
    expect(target.textContent).toBe("Owned component")
    expect(owner.resourceCount).toBe(1)
    release(); release()
    expect(target.querySelector("button")).toBeNull()
    expect(destroyed).toBe(1)
    expect(owner.resourceCount).toBe(0)
    owner.mount(Owned, { label: "Disposed component", destroyed: () => { destroyed++ } }, target)
    flushSync()
    owner.dispose(); owner.dispose()
    expect(target.querySelector("button")).toBeNull()
    expect(destroyed).toBe(2)
    owner.mount(Owned, { label: "Late component", destroyed: () => { destroyed++ } }, target)
    await Promise.resolve()
    expect(target.querySelector("button")).toBeNull()
    expect(destroyed).toBe(2)
    expect(errors).toEqual([])
  } finally { owner.dispose(); target.remove() }
})

test("component initialization that revokes ownership is immediately unmounted", () => {
  const target = document.createElement("div")
  let destroyed = 0
  const errors: unknown[] = []
  const onError = (error: unknown) => { errors.push(error) }
  const owner = new Scope({ document, onError, mount: svelteScopeMount(onError) })
  owner.mount(Owned, { label: "Reentrant", destroyed: () => { destroyed++ }, acquired: () => owner.dispose() }, target)
  expect(target.querySelector("button")).toBeNull()
  expect(destroyed).toBe(1)
  expect(owner.resourceCount).toBe(0)
  expect(errors).toEqual([])
})

test("a rejected Svelte teardown does not prevent another component from unmounting", async () => {
  const first = document.createElement("div")
  const second = document.createElement("div")
  const errors: unknown[] = []
  let destroyed = 0
  const onError = (error: unknown) => { errors.push(error) }
  const owner = new Scope({ document, onError, mount: svelteScopeMount(onError) })
  owner.mount(Owned, { label: "Throws", destroyed() { throw Error("Synthetic component teardown") } }, first)
  owner.mount(Owned, { label: "Continues", destroyed() { destroyed++ } }, second)
  flushSync()
  owner.dispose()
  expect(second.querySelector("button")).toBeNull()
  expect(destroyed).toBe(1)
  expect(owner.resourceCount).toBe(0)
  await Promise.resolve()
  expect(errors).toHaveLength(1)
})
