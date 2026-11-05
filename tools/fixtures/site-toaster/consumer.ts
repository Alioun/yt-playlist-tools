import { flushSync } from "svelte"
import type { UndoHandle, UndoReport } from "../../../src/background/add-flow/add-flow"
import { renderToaster } from "../../../src/site/kit/toaster/render"
import { undoAction } from "../../../src/site/kit/feedback/undo"
import { fixture, playlist, titles, press, settle, labels } from "./harness"

export async function consumerRecords() {
  const f = fixture()
  const renderer = renderToaster({
    owner: f.scope,
    document,
    site: "www",
    source: f.toaster,
    onError: error => {
      f.errors.push(error)
    },
    onCosmetic: variable => {
      f.cosmetics.push(variable)
    }
  })
  const records: object[] = []
  const handle: UndoHandle = { kind: "add", id: "synthetic-owner:1" }
  const seen: UndoHandle[] = []
  const undo = undoAction<UndoHandle, UndoReport>({
    label: labels.actions.undo,
    handle,
    async undo(received) {
      seen.push(received)
      return { kind: "undone" }
    },
    format(answer) {
      return answer.kind === "undone" ? null : { tone: "failure", auto: false, text: "Couldn't undo.", action: null }
    }
  })
  try {
    f.report({ report: { kind: "shortcut", outcomes: { [playlist()]: { kind: "added" } } }, feedback: true, titles: titles(), action: undo })
    await settle()
    flushSync()
    await settle()
    const shadow = renderer.readHost()?.shadowRoot
    if (!shadow) throw Error("Actual consumer did not mount its shadow host")
    records.push({
      case: "rendered",
      text: shadow.querySelector("[data-toast-text]")?.textContent,
      role: shadow.querySelector(".toast")?.getAttribute("role"),
      buttons: [...shadow.querySelectorAll("button")].map(button => button.textContent),
      mark: shadow.querySelector("[data-glyph=mark]") !== null
    })
    const key = press()
    await settle()
    flushSync()
    records.push({ case: "undo", caught: key.defaultPrevented, calls: seen.length, sameHandle: seen[0] === handle, action: f.toaster.read()?.content.action ?? null })
    f.scope.dispose()
    await settle()
    records.push({ case: "disposed", resources: f.scope.resourceCount, hosts: document.querySelectorAll("pp-toast-layer").length, timers: f.timers.count, errors: f.errors.length })
    return records
  } finally {
    f.dispose()
  }
}
