import type { TabAddReport, UndoHandle } from "../shared/contracts/tab-actions"
import type { Titles } from "../shared/copy"
import type { I18n } from "../shared/i18n"
import type { PlaylistId } from "../shared/model"
import { toastPlan, type Action, type ToastPlan } from "../shared/rules/outcomes"
import { signInUrl } from "../shared/youtube/sign-in"
import type { TabActions, Unanswered } from "./core/actions"
import type { Feedback } from "./kit/feedback"
import type { ToastAction, ToastContent } from "./kit/toaster/types"

const nothing = { tab: [], session: [] }
export const signedOutPlan: ToastPlan = {
  tone: "failure", auto: false, message: { kind: "failed", failure: "signed-out", playlists: [] }, action: { kind: "sign-in" }, remember: nothing
}

export type ExplicitContext = {
  readonly session: Feedback
  /** `playlists` names the pending toast's playlists from the cached list. */
  readonly actions: Pick<TabActions, "undo"> & Partial<Pick<TabActions, "playlists">>
  readonly i18n: I18n
  readonly location: Pick<Location, "href" | "assign">
}
export type ExplicitHandlers = {
  /** Opens the picker in choose mode, for a toast's **Choose** (YT-PK-09). */
  readonly choose?: () => void
  readonly retry?: () => void
}

function named(titles: Titles, extra: Readonly<Record<PlaylistId, string>>, i18n: I18n): Titles {
  const playlists: Partial<Record<PlaylistId, string>> = { ...titles.playlists, ...extra }
  if (!playlists["WL" as PlaylistId]) playlists["WL" as PlaylistId] = i18n.message("picker_watchLater")
  return { ...titles, playlists }
}

/** One toast action for a plan's action kind, wired to the page (YT-ADD-29). Settings and Reload have no page action here. */
export function actionFor(context: ExplicitContext, kind: Action["kind"] | undefined, undo: UndoHandle | null, handlers: ExplicitHandlers): ToastAction | null {
  const { session, actions } = context
  switch (kind) {
    case "undo": return undo ? session.action("undo", async () => {
      const answer = await actions.undo(undo)
      if (answer.kind === "undone") return null
      const failed = toastPlan({ kind: "undo-failed" }, true)
      return failed ? session.format(failed, {}, null) : null
    }) : null
    case "choose": return handlers.choose ? session.action("choose", () => { handlers.choose?.(); return null }) : null
    case "try-again": return handlers.retry ? session.action("try-again", () => { handlers.retry?.(); return null }) : null
    case "sign-in": return session.action("sign-in", () => { context.location.assign(signInUrl(context.location.href)); return null })
    default: return null
  }
}

/** What a page shows once an explicit add answers (YT-ADD-23 to 29, YT-GEN-08). Null shows nothing. */
export function explicitContent(context: ExplicitContext, answer: TabAddReport | Unanswered, titles: Titles, handlers: ExplicitHandlers): ToastContent | null {
  const { session, i18n } = context
  switch (answer.kind) {
    case "report": {
      if (!answer.toast) return null
      return session.format(answer.toast, named(titles, answer.titles, i18n), actionFor(context, answer.toast.action?.kind, answer.undo, handlers))
    }
    case "signed-out": return session.format(signedOutPlan, titles, actionFor(context, "sign-in", null, handlers))
    case "choose": handlers.choose?.(); return null
    case "stopped":
    case "no-tab":
    case "unanswered": return { text: i18n.message("site_addUnanswered"), tone: "failure", auto: false, action: null }
  }
}

/** The pending toast names its playlists before the add answers, so it reads them from the cached list (YT-ADD-22). */
async function pendingTitles(context: ExplicitContext, pending: readonly PlaylistId[], titles: Titles): Promise<Titles> {
  const missing = pending.filter(id => id !== "WL" && !titles.playlists?.[id])
  if (!missing.length || !context.actions.playlists) return titles
  try {
    const answer = await context.actions.playlists(false)
    const rows = answer.kind === "cached" || answer.kind === "listed" ? answer.listing?.rows ?? [] : []
    const found = Object.fromEntries(rows.filter(row => missing.includes(row.id) && row.title).map(row => [row.id, row.title]))
    return { ...titles, playlists: { ...titles.playlists, ...found } }
  } catch { return titles }
}

/**
 * Runs an explicit add with its pending toast: after 1 s for a key, or at once for a button, unless Show feedback
 * is off (YT-ADD-22, YT-KEY-24). The answer's toast replaces it.
 */
export async function explicitAdd(context: ExplicitContext, input: {
  readonly feedback: boolean
  readonly keyWithoutButton: boolean
  readonly pending: readonly PlaylistId[]
  readonly titles: Titles
  readonly handlers: ExplicitHandlers
}, add: () => Promise<TabAddReport | Unanswered>): Promise<TabAddReport | Unanswered> {
  const plan = input.pending.length ? toastPlan({ kind: "pending", playlists: input.pending }, input.feedback) : null
  const titles = plan ? await pendingTitles(context, input.pending, input.titles) : input.titles
  const operation = context.session.toaster.begin({ keyWithoutButton: input.keyWithoutButton,
    pending: plan ? context.session.format(plan, named(titles, {}, context.i18n), null) : null })
  let answer: TabAddReport | Unanswered
  try { answer = await add() } catch { answer = { kind: "unanswered" } }
  operation.finish(explicitContent(context, answer, input.titles, input.handlers))
  return answer
}
