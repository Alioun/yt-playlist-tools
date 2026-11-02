import { expect, test } from "bun:test"
import { nativeRegistrarProbe } from "./registrar-probe"
import { isBuildId, type BuildId } from "../../shared/contracts/vocabulary"

const build = "probe-build" as BuildId
if (!isBuildId(build)) throw new Error("Invalid probe build")

test("the files a page recorded by bundle name read as the files the Registrar injects", async () => {
  const probe = nativeRegistrarProbe({ scripting: {
    async executeScript(injection) {
      return injection.world === "MAIN" ? [{ frameId: 0, result: true }]
        : [{ frameId: 0, documentId: "document-1", result: { documentId: "document-1", loaded: [["core-www", build], ["kit-www", build], ["feature-queue-button", "older-build"]] } }]
    }
  } })
  expect(await probe.inspect({ tabId: 5, site: "www", build })).toEqual({ kind: "observed", documentId: "document-1", loaded: [
    { file: "core-www.js", build }, { file: "kit-www.js", build }, { file: "feature-queue-button.js", build: "older-build" as BuildId }, { file: "page-www.js", build }
  ] })
})
