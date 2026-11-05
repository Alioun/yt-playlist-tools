import type { Site } from "../../../shared/contracts"
import { Scope, type Dispose } from "../../core/scope"
import { svelteScopeMount } from "../scope-mount"
import { createLayerHost, type LayerHost } from "../layer-host"
import type { Toaster } from "./model"
import type { ToastView } from "./types"
import Toast from "./Toast.svelte"

export function renderToaster(options: {
  readonly owner: Scope
  readonly document: Document
  readonly site: Site
  readonly source: Toaster
  onError(error: unknown): void
  onCosmetic(variable: string): void
}) {
  const { owner, document, source, site } = options
  const scope = new Scope({ document, mount: svelteScopeMount(options.onError), onError: options.onError })
  const release = owner.add(() => scope.dispose())
  let layer: LayerHost | null = null
  let mounting = false
  let generation = 0
  let unmount: Dispose = () => {}
  let displayed: Pick<ToastView, "id" | "content"> | null = null
  function sync() {
    if (scope.disposed || document.hidden) return
    const shown = source.read()
    if (!shown) {
      generation++; displayed = null; unmount(); unmount = () => {}; layer?.dispose(); layer = null
      return
    }
    if (layer) {
      if (displayed?.id !== shown.id || displayed.content !== shown.content) { displayed = shown; layer.remeasure() }
      return
    }
    if (mounting) return
    mounting = true
    const token = ++generation
    void createLayerHost({ owner: scope, document, site, onError: options.onError, onCosmetic: options.onCosmetic }).then(next => {
      mounting = false
      if (!next) return
      if (scope.disposed || token !== generation || document.hidden || !source.read()) { next.dispose(); sync(); return }
      layer = next
      displayed = source.read()
      source.pause("hover", false); source.pause("focus", false)
      unmount = scope.mount(Toast, { source, site, document }, next.root)
      next.setActive(true)
    }).catch(error => { mounting = false; options.onError(error) })
  }
  scope.add(source.subscribe(() => sync()))
  scope.on(document, "visibilitychange", sync)
  scope.add(() => { generation++; source.unpresented(); unmount(); layer?.dispose(); layer = null })
  sync()
  return { dispose: release, readHost: () => layer?.host ?? null }
}
