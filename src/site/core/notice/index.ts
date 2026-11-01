import type { DueNotice } from "../../../shared/contracts/tab-view"
import type { Dispose, Scope } from "../scope"

export type NoticePresentation = {
  readonly due: DueNotice
  readonly generation: object
  readonly text: string
  readonly detailsLabel: string
  readonly dismissLabel: string
  details(): void
  dismiss(): void
  presented(): void
}
export type NoticePresenter = { present(notice: NoticePresentation): Dispose }
export type DueNoticeInput = Omit<NoticePresentation, "details" | "dismiss" | "presented"> & {
  details(due: DueNotice, generation: object, destination: "#diagnostics"): void
  dismiss(due: DueNotice, generation: object): void
  presented(due: DueNotice, generation: object): void
}

export function createNoticeOwner(options: { readonly scope: Scope; readonly initial: NoticePresenter; onError(error: unknown): void }) {
  let presenter = options.initial
  let current: DueNoticeInput | null = null
  let release: Dispose = () => {}
  let revision = 0
  let shown = false
  function detach() { revision++; release(); release = () => {} }
  function attach() {
    if (options.scope.disposed || !current) return
    const record = current
    const version = revision
    const live = () => !options.scope.disposed && current === record && revision === version
    const effect = (run: () => void) => { if (live()) { try { run() } catch (error) { options.onError(error) } } }
    const nextRelease = presenter.present({ ...record,
      details: () => effect(() => record.details(record.due, record.generation, "#diagnostics")),
      dismiss: () => effect(() => {
        current = null; detach()
        record.dismiss(record.due, record.generation)
      }),
      presented: () => effect(() => { if (shown) return; shown = true; record.presented(record.due, record.generation) })
    })
    if (live()) release = nextRelease
    else nextRelease()
  }
  options.scope.add(() => { current = null; detach() })
  return {
    update(notice: DueNoticeInput | null) {
      if (options.scope.disposed) return
      detach(); current = notice; shown = false; attach()
    },
    transfer(next: NoticePresenter) {
      if (options.scope.disposed || presenter === next) return
      detach(); presenter = next; attach()
    },
    read: () => current
  }
}
export type NoticeOwner = ReturnType<typeof createNoticeOwner>
