import type { Site } from "../../shared/contracts"
import { siteFeedbackText } from "../../shared/copy"
import type { AnySiteCore } from "../core/core"
import { tabAsks } from "../core/asks"
import type { MusicItems } from "../core/items-music"
import { loadPopovers } from "../popovers/loader"
import { osOf } from "../../shared/keys/policy"
import type { createMusicQuick, MusicQuick } from "./music/quick"
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
  /** YouTube Music's quick actions, which only `kit-music.js` carries. */
  readonly music: MusicQuick | null
}

const ignore = () => {}
const viewWaitMs = 5_000

function viewReady(link: AnySiteCore["link"], scope: Scope): Promise<boolean> {
  if (link.view) return Promise.resolve(true)
  return new Promise(resolve => {
    let stop = () => {}
    const timer = scope.timeout(() => { stop(); resolve(false) }, viewWaitMs)
    stop = link.onView(view => { if (!view) return; timer(); stop(); resolve(true) })
  })
}

/** One kit per page (06 §6.4.2): the toaster, the moving overlay and Svelte mounting for feature scopes. */
export function installKit(core: AnySiteCore, lib: object, quick?: typeof createMusicQuick): Kit {
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
  const timer = (ms: number, done: () => void) => own.timeout(done, ms)
  const music = quick && core.site === "music" ? quick({ owner: root, document, page: core.page, items: core.items as MusicItems, actions: core.actions, health: core.health,
    i18n, view: () => link.view, feedback: () => feedback.use(root), popovers: () => loadPopovers(core.actions.need, timer), location: window.location,
    notices: core.notices as { wouldAct(feature: "music-keys" | "shortcuts"): void }, os: osOf(navigator.platform) }) : null
  const asks = tabAsks({ site, document, actions: core.actions, i18n, feedback: () => feedback.use(root) })
  core.attachKit({
    mount: svelteScopeMount(ignore),
    asks: music ? { ...asks, async music(payload) {
      // A tab the background has just injected may still be meeting its page half and its view.
      await core.page.hello
      if (!await viewReady(link, own)) return { kind: "failed", text: null }
      const found = await music.playing(payload.action)
      const answer = found.kind === "target"
        ? await music.act(payload.action, found.target, { opener: "any-tab-keys", feedback: payload.feedback, by: "key", anyTab: true })
        : found
      return { kind: answer.kind === "done" || answer.kind === "already" ? "done" : "failed", text: answer.text }
    } } : asks,
    notices: toaster ? toasterNoticePresenter({ source: toaster, scope: own, document }) : { present: () => ignore }
  })
  return { site, feedback, overlay, lib, music }
}
