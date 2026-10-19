// Preload for probes/: which runtime plugin hooks Bun calls for bare specifiers.
import { plugin } from "bun"

export const calls: string[] = []

plugin({
  name: "probe",
  setup(build) {
    build.onResolve({ filter: /^virtual-probe$/ }, () => {
      calls.push("onResolve virtual-probe")
      return { path: "virtual-probe", namespace: "probe" }
    })
    build.onLoad({ filter: /.*/, namespace: "probe" }, () => ({
      contents: "export default 'from onResolve'",
      loader: "js"
    }))
    build.module("virtual-module-probe", () => ({
      contents: "export default 'from build.module'",
      loader: "js"
    }))
  }
})
