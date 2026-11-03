import type { Job, JobInvocation, JobOf, JobResult, Origin, Site } from "../../shared/contracts"
import type { AccountKey } from "../../shared/model"
import type { Answer, Execution, Ports } from "../add-flow/add-flow"
import type { Requester, RoutingNeed, TabJobOutcome, Tabs } from "../tabs/ports"

export type ExecutionTabs = Pick<Tabs, "serve" | "runIn" | "accountInView" | "known">
// The popup's authenticated window and active tab (ARC-ACC-65). The composition binds it to the sender check; a payload never supplies it.
export type ExecutionRequester = (origin: Extract<Origin, { kind: "ui" }>) => Promise<Requester | null>

type Delivered<J extends Job> = { readonly kind: "result"; readonly result: JobResult<J> } | { readonly kind: "not-sent" | "account-refused" | "unknown" }

// AddFlow's execution port over the one Tabs engine (ARC-ACC-73). A popup origin serves from the account in view through `Tabs.serve`;
// a tab origin runs in that tab through `Tabs.runIn`, as that tab's account. Jobs pass through unchanged, so their brands and facts stay their own.
// Tabs' own guarded candidate order handles an account change. No page outcome is invented: a job that may have run reads as unconfirmed.
export function createTabsExecution(tabs: ExecutionTabs, requester: ExecutionRequester): Ports["execution"] {
  let serial = 0
  return async (origin, site) => {
    if (origin.kind === "ui") {
      const req = await requester(origin)
      if (!req || req.windowId !== origin.windowId || req.incognito !== origin.incognito) return null
      const view = await tabs.accountInView(req)
      if (view.kind !== "account") return null
      const acct = view.acct
      return execution(`ui:${origin.windowId}:${++serial}`, acct, invocation => tabs.serve(invocation, need(site, req, acct)))
    }
    if (origin.kind !== "tab") return null
    const [known] = await tabs.known({ kind: "tab", tabId: origin.tabId })
    if (!known || known.privateTab !== origin.incognito) return null
    // A tab origin has no popup window; WINDOW_ID_NONE stands for it, and Tabs reads only the realm and the tab itself.
    const req: Requester = { windowId: -1, incognito: origin.incognito, activeTabId: origin.tabId }
    return execution(`tab:${origin.tabId}`, known.acct, invocation => tabs.runIn(origin.tabId, invocation, need(site, req, known.acct)))
  }
}

function need(site: Site, req: Requester, acct: AccountKey | null): RoutingNeed {
  return { site, req, account: acct === null ? { kind: "any" } : { kind: "account", acct, signedIn: true } }
}

function execution(lane: string, acct: AccountKey | null, route: <J extends Job>(invocation: JobInvocation<J>) => Promise<TabJobOutcome<J>>): Execution {
  let served: number | null = null
  async function deliver<J extends Job>(invocation: JobInvocation<J>): Promise<Delivered<J>> {
    let outcome: TabJobOutcome<J>
    try {
      outcome = await route(invocation)
    } catch {
      return { kind: "unknown" }
    }
    switch (outcome.kind) {
      case "result":
        served = outcome.tabId
        return { kind: "result", result: outcome.result }
      case "transport":
        return { kind: "unknown" }
      case "guard":
        return { kind: outcome.reason === "accountChanged" ? "account-refused" : "not-sent" }
      case "no-tab":
      case "session":
        return { kind: "not-sent" }
    }
  }
  // A job whose delivery is unknown may have changed the playlist, so it is unconfirmed, never not-sent.
  const unconfirmed = { ok: false, reason: "unconfirmed" } as const
  return {
    lane,
    acct,
    served: () => served,
    run: {
      membership: async call => {
        const answer = await deliver<JobOf<"membership">>(call)
        return answer.kind === "result" ? answer : ({ kind: "fact", fact: answer.kind === "unknown" ? "unreadable" : answer.kind } satisfies Answer<"membership">)
      },
      add: async call => {
        const answer = await deliver<JobOf<"add">>(call)
        return answer.kind === "result" ? answer : answer.kind === "unknown" ? { kind: "result", result: unconfirmed } : { kind: "fact", fact: answer.kind }
      },
      save: async call => {
        const answer = await deliver<JobOf<"save">>(call)
        return answer.kind === "result" ? answer : answer.kind === "unknown" ? { kind: "result", result: unconfirmed } : { kind: "fact", fact: answer.kind }
      },
      remove: async call => {
        const answer = await deliver<JobOf<"remove">>(call)
        return answer.kind === "result" ? answer : answer.kind === "unknown" ? { kind: "result", result: unconfirmed } : { kind: "fact", fact: answer.kind }
      },
      unsave: async call => {
        const answer = await deliver<JobOf<"unsave">>(call)
        return answer.kind === "result" ? answer : answer.kind === "unknown" ? { kind: "result", result: unconfirmed } : { kind: "fact", fact: answer.kind }
      },
      addBatch: async call => {
        const answer = await deliver<JobOf<"addBatch">>(call)
        return answer.kind === "result" ? answer : answer.kind === "unknown" ? { kind: "result", result: unconfirmed } : { kind: "fact", fact: answer.kind }
      },
      removeBatch: async call => {
        const answer = await deliver<JobOf<"removeBatch">>(call)
        return answer.kind === "result" ? answer : answer.kind === "unknown" ? { kind: "result", result: unconfirmed } : { kind: "fact", fact: answer.kind }
      }
    }
  }
}
