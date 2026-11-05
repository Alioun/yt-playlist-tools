import { Scope } from "../../core/scope"
import { createFeedback, type Feedback } from "./index"
import { renderToaster } from "../toaster/render"

export function createFeedbackSession(options: Omit<Parameters<typeof createFeedback>[0], "scope"> & {
  readonly owner: Scope
  onCosmetic(variable: string): void
}) {
  const consumers = new Map<Scope, () => void>()
  let state = options.initial
  let current: { readonly scope: Scope; readonly feedback: Feedback; readonly renderer: ReturnType<typeof renderToaster> } | null = null
  function stop() { current?.scope.dispose(); current = null }
  options.owner.add(() => { for (const release of [...consumers.values()]) release(); stop() })
  return {
    use(owner: Scope): Feedback | null {
      if (options.owner.disposed || owner.disposed) return null
      if (!current) {
        const scope = new Scope({ document: options.document, onError: options.onError })
        try {
          const feedback = createFeedback({ ...options, initial: state, scope })
          const renderer = renderToaster({ owner: scope, document: options.document, site: options.site, source: feedback.toaster,
            onError: options.onError, onCosmetic: options.onCosmetic })
          current = { scope, feedback, renderer }
        } catch (error) { scope.dispose(); throw error }
      }
      if (!consumers.has(owner)) {
        const release = owner.add(() => { consumers.delete(owner); if (!consumers.size) stop() })
        consumers.set(owner, release)
      }
      return current.feedback
    },
    update(next: typeof state) { if (options.owner.disposed) return; state = next; current?.feedback.update(next) },
    read: () => current
  }
}
