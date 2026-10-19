// Preload 2 of 3. Enough of what WxtVitest() does for Vitest to run 1.x
// modules under `bun test`. 2.0 code with explicit imports needs only the
// first line.
import "./fake-browser"

import { plugin } from "bun"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

// `#imports`. WXT rewrites it at build time with unimport; nothing exists on
// disk. Serve it as a virtual module that re-exports every module listed in
// the `.wxt/types/imports-module.d.ts` that `wxt prepare` generates, so the
// list stays in step with wxt.config.ts.
//
// It has to be `build.module()`: runtime `onResolve`/`onLoad` hooks "only
// match when the import specifier contains a '.' or a ':'" (Bun.plugin in
// bun-types/bun.d.ts), and `#imports` has neither.
const wxtDir = resolve(import.meta.dir, "../../../../.wxt")
const importsDts = resolve(wxtDir, "types/imports-module.d.ts")

plugin({
  name: "wxt-imports",
  setup(build) {
    build.module("#imports", () => {
      if (!existsSync(importsDts)) {
        throw new Error("Run `wxt prepare` first: .wxt/types/imports-module.d.ts is missing")
      }
      const specifiers = new Set(
        [...readFileSync(importsDts, "utf8").matchAll(/from '([^']+)'/g)].map((m) => m[1]!)
      )
      const contents = [...specifiers]
        // WXT writes project paths relative to .wxt/ (toExports(..., wxtDir)).
        .map((s) => Bun.resolveSync(s, wxtDir))
        // `export *` carries values only, so the type-only names in the .d.ts drop out.
        .map((path) => `export * from ${JSON.stringify(path)}`)
        .join("\n")
      return { contents, loader: "ts" }
    })

    // Re-exporting everything also loads wxt/utils/app-config, which imports
    // WXT's other virtual module. WxtVitest's resolveAppConfig serves
    // <srcDir>/app.config.ts, or `export default {}` when there is none.
    const appConfig = resolve(wxtDir, "../src/app.config.ts")
    build.module("virtual:app-config", () =>
      existsSync(appConfig)
        ? { contents: `export { default } from ${JSON.stringify(appConfig)}`, loader: "ts" }
        : { contents: "export default {}", loader: "js" }
    )
  }
})
