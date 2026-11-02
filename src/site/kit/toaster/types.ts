import type { Action, ToastPlan } from "../../../shared/rules/outcomes"

export type ToastAction = {
  readonly kind: Action["kind"]
  readonly label: string
  run(): Promise<ToastContent | null> | ToastContent | null
  /** Lets the background drop an Undo handle once its toast is gone without being used. Called at most once. */
  release?(): void
}
export type ToastContent = {
  readonly text: string
  readonly tone: ToastPlan["tone"]
  readonly auto: boolean
  readonly action: ToastAction | null
}
export type NoticeContent = ToastContent & {
  readonly tone: "failure"
  readonly auto: true
  readonly dismiss: { readonly label: string; run(): void }
  presented(): void
}
export type ToastView = {
  readonly id: number
  readonly generation: number
  readonly content: ToastContent
  readonly kind: "transient" | "pending" | "notice"
  readonly busy: boolean
  readonly remaining: number
  act(): Promise<void>
  dismiss: { readonly label: string; run(): void } | null
}
export type ToastHandle = { replace(content: ToastContent): boolean; release(): void }
export type Operation = { finish(content: ToastContent | null): void; cancel(): void }
