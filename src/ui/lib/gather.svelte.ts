import type { GatherLine, GatherPush, UiGatherAnswer } from "../../shared/contracts/ui-gather"
import type { RpcOutcome } from "../../shared/rpc/rpc"
import type { ExtensionPage } from "../shell/start"

/**
 * Gather tabs' line in the popup row and the Settings card (UI-POP-37, UI-SET-24): a running gather's progress, then its
 * result, else the last gather or the waiting line. The line is the row's own state, so Show feedback never hides it.
 * The popup is the one page that shows its window's results, so only it tells the background a result was seen.
 */
export class GatherRow {
  line = $state.raw<GatherLine | null>(null)
  running = $state(false)
  readonly #page: ExtensionPage
  readonly #stop: () => void
  #own = false
  #disposed = false
  // Bumped by every push and every answer of this page's own, so a slower idle read never overwrites them.
  #version = 0

  constructor(page: ExtensionPage) {
    this.#page = page
    this.#stop = page.backend.watchGather(push => this.#pushed(push))
  }
  #mine(push: GatherPush): boolean { return typeof this.#page.windowId === "number" && push.windowId === this.#page.windowId }
  #pushed(push: GatherPush): boolean {
    if (this.#disposed) return false
    if (this.#mine(push)) {
      this.#version++
      this.running = push.running
      if (push.line) this.line = push.line
      return !push.running && push.line !== null
    }
    if (!push.running && !this.#own) void this.refresh()
    return false
  }
  async refresh(): Promise<void> {
    const version = this.#version
    const answer = await this.#page.backend.call("ui.gathers", {})
    if (this.#disposed || this.#own || version !== this.#version) return
    if (answer.kind !== "answered" || answer.result.kind !== "gathers") { this.line = null; this.running = false; return }
    this.running = answer.result.running
    this.line = answer.result.line
  }
  #answered(answer: RpcOutcome<UiGatherAnswer>): GatherLine | null {
    if (answer.kind !== "answered") return { text: this.#page.i18n.message("gather_unavailable"), tone: "failure", action: null }
    return answer.result.kind === "line" ? answer.result.line : null
  }
  /** Gather, or Try again for a gather's failed videos. */
  async gather(retry?: string): Promise<GatherLine | null> {
    if (this.running || this.#disposed) return null
    this.#own = true
    this.running = true
    try {
      const line = this.#answered(await this.#page.backend.call("ui.gather", retry ? { retry } : {}))
      this.#version++
      if (!this.#disposed && line) this.line = line
      return line
    } finally {
      this.#own = false
      this.running = false
    }
  }
  async undo(id: string): Promise<void> {
    if (this.running || this.#disposed) return
    this.#own = true
    this.running = true
    try {
      const line = this.#answered(await this.#page.backend.call("ui.gatherUndo", { id }))
      this.#version++
      if (!this.#disposed && line) this.line = line
    } finally {
      this.#own = false
      this.running = false
    }
  }
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#stop()
  }
}
