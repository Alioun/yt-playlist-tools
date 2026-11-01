import type { JobFailure } from "../../shared/contracts"
import type { PageAccountData } from "../../shared/contracts/page"
import type { PageReadPort } from "../read-port"
import { field } from "../read-parsers"

export function createAccountGuard(page: PageReadPort, pinned: PageAccountData | undefined) {
  let changed = false
  function check(required: boolean): JobFailure | null {
    if (required && changed) return { ok: false, reason: "accountChanged" }
    if (!pinned) return required ? { ok: false, reason: "unavailable" } : null
    try {
      const loggedIn = page.config("LOGGED_IN"), id = page.config("DATASYNC_ID")
      if (pinned.signedIn && (loggedIn === false || typeof id === "string" && id !== pinned.datasyncId)) changed = true
      if (required && changed) return { ok: false, reason: "accountChanged" }
      if (!required) return null
      if (!pinned.signedIn) return { ok: false, reason: "signedOut" }
      if (loggedIn !== true || typeof id !== "string" || id.length === 0) return { ok: false, reason: "unavailable" }
      return null
    } catch { return required ? { ok: false, reason: "unavailable" } : null }
  }
  return {
    check,
    response(required: boolean, body: unknown, allowMissing: boolean): JobFailure | null {
      if (!required || allowMissing) return check(required)
      const id = field(body, "responseContext", "mainAppWebResponseContext", "datasyncId")
      return typeof id === "string" && id.length > 0 ? check(required) : { ok: false, reason: "unavailable" }
    },
    observe(body: unknown): void {
      for (const context of ["mainAppWebResponseContext", "webResponseContext"]) {
        const id = field(body, "responseContext", context, "datasyncId")
        if (pinned?.signedIn && typeof id === "string" && id !== pinned.datasyncId) changed = true
      }
    }
  }
}
