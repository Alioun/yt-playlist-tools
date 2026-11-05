import type { ToastAction, ToastContent } from "../toaster/types"

export function undoAction<Handle, Answer>(options: {
  readonly label: string
  readonly handle: Handle
  undo(handle: Handle): Promise<Answer>
  format(answer: Answer): ToastContent | null
}): ToastAction {
  return { kind: "undo", label: options.label, async run() { return options.format(await options.undo(options.handle)) } }
}
