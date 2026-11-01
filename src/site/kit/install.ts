import type { Site } from "../../shared/contracts"
import { siteFeedbackText } from "../../shared/copy"
import type { AnySiteCore } from "../core/core"
import { Scope } from "../core/scope"
import { toasterNoticePresenter } from "./feedback/notice"
import { createFeedbackSession } from "./feedback/session"
import { createOverlayKit, type OverlayKit } from "./overlay"
import { svelteScopeMount } from "./scope-mount"

export type Kit = {
  readonly site: Site
  readonly feedback: ReturnType<typeof createFeedbackSession>
  readonly overlay: OverlayKit
  readonly lib: object
}

const ignore = () => {}

/** One kit per page (06 §6.4.2): the toaster, the moving overlay and Svelte mounting for feature scopes. */
export function installKit(core: AnySiteCore, lib: object): Kit {
  const { document, i18n, keys, root, site, link } = core
  const labels = siteFeedbackText(i18n)
  const view = link.view
  const feedback = createFeedbackSession({
    owner: root, document, keys, site, i18n,
    labels: { actions: labels.actions, nothingToUndo: labels.nothingToUndo },
    initial: { undoKey: view?.undoKey ?? null, features: view?.features ?? [] },
    now: () => performance.now(), onError: ignore, onCosmetic: ignore
  })
  root.add(link.onView(next => { if (next) feedback.update({ undoKey: next.undoKey, features: next.features }) }))
  const overlay = createOverlayKit({ owner: root, document, onError: ignore })
  const own = new Scope({ document, onError: ignore })
  root.add(() => own.dispose())
  const toaster = feedback.use(own)?.toaster
  core.attachKit({
    mount: svelteScopeMount(ignore),
    notices: toaster ? toasterNoticePresenter({ source: toaster, scope: own, document }) : { present: () => ignore }
  })
  return { site, feedback, overlay, lib }
}
