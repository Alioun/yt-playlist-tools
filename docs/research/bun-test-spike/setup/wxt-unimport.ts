// Parity experiment: run WXT's own auto-import transform under `bun test`.
//   bun test --config=bunfig.parity.toml ./parity
//
// WxtVitest() does `registerWxt("serve")` and then
// `UnimportPlugin.vite(wxt.config.imports)`. unimport's unplugin also has a
// Bun adapter, but it is written for Bun.build: it calls build.onStart(),
// which a runtime plugin does not have ("build.onStart is not a function").
// So this calls unimport directly from a runtime onLoad hook.
//
// The catch: `registerWxt` and the resolved `wxt.config` are WXT internals,
// not in its package exports, so this imports a dist file by path.
import { plugin } from "bun"
import { createUnimport } from "unimport"
// @ts-expect-error -- internal and untyped: WXT ships no .d.mts for it.
import { registerWxt, wxt } from "../../../../node_modules/wxt/dist/core/wxt.mjs"

const root = new URL("../../../..", import.meta.url).pathname
await registerWxt("serve", { root })
const unimport = createUnimport(wxt.config.imports)
await unimport.init()

const escapedRoot = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

plugin({
  name: "wxt-auto-imports",
  setup(build) {
    // Only the project's own sources; node_modules keep Bun's default loader.
    build.onLoad({ filter: new RegExp(`^${escapedRoot}(src|docs)/.*\\.[jt]sx?$`) }, async ({ path }) => {
      const { code } = await unimport.injectImports(await Bun.file(path).text(), path)
      return { contents: code, loader: path.endsWith("x") ? "tsx" : "ts" }
    })
  }
})
