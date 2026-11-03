// Runs svelte-check with its `typescript` imports served by the typescript6 alias.
// svelte-check 4.7 needs TypeScript 5 or 6, and TypeScript 7's package has no compiler API.
// Its --tsgo flag still finds TypeScript 7 through @typescript/native.
import { createRequire, registerHooks } from "node:module"

registerHooks({
  resolve(specifier, context, nextResolve) {
    const typescript = /^typescript(?=\/|$)/
    return nextResolve(typescript.test(specifier) ? specifier.replace(typescript, "typescript6") : specifier, context)
  }
})

createRequire(import.meta.url)("svelte-check/bin/svelte-check")
