import type { NoticePresenter } from "../../core/notice"
import type { Scope } from "../../core/scope"
import type { Toaster } from "../toaster/model"

export function toasterNoticePresenter(options: { readonly source: Toaster; readonly scope: Scope; readonly document: Document }): NoticePresenter {
  return { present(notice) {
    const release = options.source.notice({ text: notice.text, tone: "failure", auto: true,
      action: { kind: "settings", label: notice.detailsLabel, run: () => { notice.details(); return null } },
      dismiss: { label: notice.dismissLabel, run: notice.dismiss }, presented: notice.presented })
    return options.scope.add(release)
  } }
}
