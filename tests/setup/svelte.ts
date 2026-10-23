import { plugin } from "bun"
import { compile, compileModule } from "svelte/compiler"

const ts = new Bun.Transpiler({ loader: "ts" })

plugin({
  name: "svelte",
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
      contents: compile(await Bun.file(path).text(), {
        filename: path,
        generate: "client",
        css: "injected",
        runes: path.includes("/node_modules/") ? undefined : true
      }).js.code,
      loader: "js"
    }))
    build.onLoad({ filter: /\.svelte\.[jt]s$/ }, async ({ path }) => {
      const source = await Bun.file(path).text()
      return {
        contents: compileModule(path.endsWith(".ts") ? ts.transformSync(source) : source, {
          filename: path,
          generate: "client"
        }).js.code,
        loader: "js"
      }
    })
  }
})
