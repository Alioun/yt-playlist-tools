// No import lines: `storage`, `browser` and `defineBackground` are WXT
// auto-imports, as in 1.x's src/entrypoints/background.ts.
export const counter = storage.defineItem<number>("local:counter", { fallback: 0 })

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    await counter.setValue((await counter.getValue()) + 1)
  })
})
