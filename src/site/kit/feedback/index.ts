import type { Site } from "../../../shared/contracts"
import type { TabView } from "../../../shared/contracts/tab-view"
import { toastText, type Titles } from "../../../shared/copy"
import type { I18n } from "../../../shared/i18n"
import { toastPlan, type Action, type Report, type ToastPlan } from "../../../shared/rules/outcomes"
import { registerCoreUndo, type Keys } from "../../core/keys"
import type { Scope } from "../../core/scope"
import { createToaster } from "../toaster/model"
import type { ToastAction, ToastContent } from "../toaster/types"

export type FeedbackLabels = {
  readonly actions: Readonly<Record<Action["kind"], string>>
  readonly nothingToUndo: string
}
export type FeedbackOutcome = {
  readonly plan: ToastPlan
  readonly titles: Titles
  readonly action: ToastAction | null
}

export function createFeedback(options: {
  readonly scope: Scope
  readonly document: Document
  readonly keys: Keys
  readonly site: Site
  readonly i18n: I18n
  readonly labels: FeedbackLabels
  readonly initial: Pick<TabView, "undoKey" | "features">
  now(): number
  onError(error: unknown): void
}) {
  const { scope, document, site, i18n, labels } = options
  let state = options.initial
  function content(plan: ToastPlan, titles: Titles, action: ToastAction | null): ToastContent {
    return { text: toastText(plan, titles, site, i18n), tone: plan.tone, auto: plan.auto,
      action: plan.action && action?.kind === plan.action.kind ? action : null }
  }
  function failed() {
    const plan = toastPlan({ kind: "undo-failed" }, true)
    if (!plan) throw new Error("Canonical Undo failure plan unavailable")
    return content(plan, {}, null)
  }
  const toaster = createToaster({ scope, document, now: options.now, onError: options.onError, actionFailed: failed,
    nothingToUndo: () => ({ tone: "hint", auto: false, text: labels.nothingToUndo, action: null }) })
  function shortcutEnabled() { return state.features.some(feature => feature.id === "shortcuts" || feature.id === "music-keys") }
  const bindingState = () => ({ undoKey: state.undoKey, toastVisible: toaster.hasUndo(), shortcutEnabled: shortcutEnabled() })
  const binding = registerCoreUndo(options.keys, scope, { undoCurrent: () => toaster.undoCurrent() }, bindingState())
  function refresh() { toaster.setShortcutEnabled(shortcutEnabled()); binding.update(bindingState()) }
  scope.add(toaster.subscribe(refresh)); refresh()
  return {
    toaster,
    update(next: typeof state) { if (scope.disposed) return; state = next; refresh() },
    format: content,
    report(input: { readonly report: Report; readonly feedback: boolean; readonly titles: Titles; readonly action: ToastAction | null }) {
      const plan = toastPlan(input.report, input.feedback)
      return plan ? toaster.show(content(plan, input.titles, input.action)) : null
    },
    begin(input: { readonly playlists: Extract<Report, { kind: "pending" }>["playlists"]; readonly titles: Titles;
      readonly feedback: boolean; readonly keyWithoutButton: boolean }) {
      const plan = toastPlan({ kind: "pending", playlists: input.playlists }, input.feedback)
      const operation = toaster.begin({ keyWithoutButton: input.keyWithoutButton, pending: plan ? content(plan, input.titles, null) : null })
      return {
        finish(answer: { readonly report: Report; readonly titles: Titles; readonly action: ToastAction | null }) {
          const result = toastPlan(answer.report, input.feedback)
          operation.finish(result ? content(result, answer.titles, answer.action) : null)
        }, cancel: operation.cancel
      }
    },
    action(kind: Action["kind"], run: ToastAction["run"]): ToastAction { return { kind, label: labels.actions[kind], run } },
    fromOutcome(answer: FeedbackOutcome) { return content(answer.plan, answer.titles, answer.action) }
  }
}
export type Feedback = ReturnType<typeof createFeedback>
