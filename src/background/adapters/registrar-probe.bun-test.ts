import { afterEach, expect, test } from "bun:test"
import { nativeRegistrarProbe, type ProbeBrowser } from "./registrar-probe"
import { isBuildId, type BuildId } from "../../shared/contracts/vocabulary"
import { pageJobsPresenceEvent, pagePresenceEvent } from "../../shared/rpc/page-channel"

const build = "probe-build" as BuildId
if (!isBuildId(build)) throw new Error("Invalid probe build")
const answers: [string, (event: Event) => void][] = []
afterEach(() => {
  for (const [type, listener] of answers.splice(0)) document.removeEventListener(type, listener)
})

/** A tab whose MAIN-world check really runs in this document, where the page half answers for the files it has. */
function tab(): ProbeBrowser {
  return {
    scripting: {
      async executeScript(injection) {
        if (injection.world === "MAIN") return [{ frameId: 0, result: injection.func(...(injection.args ?? ([] as never))) }]
        return [
          {
            frameId: 0,
            documentId: "document-1",
            result: {
              documentId: "document-1",
              loaded: [
                ["core-www", build],
                ["kit-www", build],
                ["feature-queue-button", "older-build"]
              ]
            }
          }
        ]
      }
    }
  }
}
function answer(type: string, answered: string) {
  const listener = (event: Event) => {
    if (event instanceof CustomEvent && event.detail === answered) event.preventDefault()
  }
  document.addEventListener(type, listener)
  answers.push([type, listener])
}

test("the files a page recorded by bundle name read as the files the Registrar injects", async () => {
  answer(pagePresenceEvent, build)
  expect(await nativeRegistrarProbe(tab()).inspect({ tabId: 5, site: "www", build })).toEqual({
    kind: "observed",
    documentId: "document-1",
    loaded: [
      { file: "core-www.js", build },
      { file: "kit-www.js", build },
      { file: "feature-queue-button.js", build: "older-build" as BuildId },
      { file: "page-www.js", build }
    ]
  })
})

test("the jobs file reads as loaded only once the page half of this build has taken it", async () => {
  answer(pagePresenceEvent, build)
  answer(pageJobsPresenceEvent, "probe-older-build")
  const probe = nativeRegistrarProbe(tab())
  const files = async (site: "www" | "music") => {
    const seen = await probe.inspect({ tabId: 5, site, build })
    return seen.kind === "observed" ? seen.loaded.map(entry => entry.file).filter(file => file.startsWith("page-")) : []
  }
  expect(await files("www")).toEqual(["page-www.js"])
  answer(pageJobsPresenceEvent, build)
  expect(await files("www")).toEqual(["page-www.js", "page-jobs-www.js"])
  expect(await files("music")).toEqual(["page-music.js", "page-jobs-music.js"])
})
