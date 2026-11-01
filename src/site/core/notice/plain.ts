import type { Site } from "../../../shared/contracts"
import { Scope, type Dispose } from "../scope"
import { createNoticeLayer, type NoticeLayer } from "./host"
import type { NoticePresentation, NoticePresenter } from "./index"
import { errorPath, outlineErrorPath } from "./skin"

export function plainNoticePresenter(options: {
  readonly owner: Scope
  readonly document: Document
  readonly site: Site
  onError(error: unknown): void
  onCosmetic(variable: string): void
}): NoticePresenter {
  return { present(notice: NoticePresentation): Dispose {
    const { owner, document, site } = options
    const scope = new Scope({ document, onError: options.onError })
    const release = owner.add(() => scope.dispose())
    let layer: NoticeLayer | null = null
    let mounting = false
    let epoch = 0
    function eligible() { return !scope.disposed && !document.hidden && document.fullscreenElement === null }
    function update() {
      if (document.hidden || scope.disposed) return
      if (!eligible()) { epoch++; layer?.dispose(); layer = null; return }
      if (layer || mounting) return
      mounting = true
      const version = ++epoch
      void createNoticeLayer({ owner: scope, document, site, onError: options.onError, onCosmetic: options.onCosmetic }).then(next => {
        mounting = false
        if (!next) return
        if (!eligible() || version !== epoch) { next.dispose(); update(); return }
        layer = next
        const toast = document.createElement("div"); toast.className = "toast"; toast.setAttribute("role", "alert"); toast.setAttribute("aria-atomic", "true")
        const glyph = document.createElementNS("http://www.w3.org/2000/svg", "svg")
        glyph.setAttribute("viewBox", "0 0 24 24"); glyph.setAttribute("aria-hidden", "true"); glyph.setAttribute("class", "glyph error"); glyph.setAttribute("data-glyph", "error")
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d", site === "music" ? outlineErrorPath : errorPath); glyph.append(path)
        const text = document.createElement("span"); text.textContent = notice.text
        const details = document.createElement("button"); details.type = "button"; details.textContent = notice.detailsLabel
        const dismiss = document.createElement("button"); dismiss.type = "button"; dismiss.textContent = "×"; dismiss.setAttribute("aria-label", notice.dismissLabel)
        next.scope.on(details, "click", () => { if (eligible() && version === epoch) notice.details() })
        next.scope.on(dismiss, "click", () => { if (eligible() && version === epoch) notice.dismiss() })
        toast.append(glyph, text, details, dismiss); next.root.append(toast); next.setActive(true)
        notice.presented()
      }).catch(error => { mounting = false; options.onError(error) })
    }
    scope.on(document, "visibilitychange", update)
    scope.on(document, "fullscreenchange", update)
    scope.add(() => { epoch++; layer?.dispose(); layer = null })
    update()
    return release
  } }
}
